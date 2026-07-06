import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { blobProxyUrl } from "@/lib/blob/urls";
import type { GbpJobPhotoDto } from "@/lib/google-business/engagement-types";
import { prisma } from "@/lib/prisma";

const DAYS = 14;

export async function GET() {
  try {
    const user = await requireSessionUser();
    const since = new Date();
    since.setDate(since.getDate() - DAYS);

    const attachments = await prisma.visitAttachment.findMany({
      where: {
        mimeType: { startsWith: "image/" },
        createdAt: { gte: since },
        visit: { companyId: user.companyId },
      },
      orderBy: { createdAt: "desc" },
      take: 120,
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        blobUrl: true,
        createdAt: true,
        visit: {
          select: {
            id: true,
            title: true,
            startAt: true,
          },
        },
      },
    });

    const photos: GbpJobPhotoDto[] = attachments.map((row) => ({
      id: row.id,
      fileName: row.fileName,
      mimeType: row.mimeType,
      previewUrl: blobProxyUrl(row.blobUrl) ?? row.blobUrl,
      visitId: row.visit.id,
      visitTitle: row.visit.title,
      visitStartAt: row.visit.startAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    }));

    return NextResponse.json({ photos, days: DAYS });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Failed to load job photos";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
