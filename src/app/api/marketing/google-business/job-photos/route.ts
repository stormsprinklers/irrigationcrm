import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { blobProxyUrl } from "@/lib/blob/urls";
import type { GbpJobPhotoDto } from "@/lib/google-business/engagement-types";
import { fetchRecentSocialPhotos } from "@/lib/meta/social-photos";
import { prisma } from "@/lib/prisma";

const DAYS = 14;

export async function GET() {
  try {
    const user = await requireSessionUser();
    const since = new Date();
    since.setDate(since.getDate() - DAYS);

    const [attachments, socialPhotos] = await Promise.all([
      prisma.visitAttachment.findMany({
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
      }),
      fetchRecentSocialPhotos(user.companyId, DAYS).catch(() => [] as GbpJobPhotoDto[]),
    ]);

    const visitPhotos: GbpJobPhotoDto[] = attachments.map((row) => ({
      id: row.id,
      source: "visit",
      fileName: row.fileName,
      mimeType: row.mimeType,
      previewUrl: blobProxyUrl(row.blobUrl) ?? row.blobUrl,
      visitId: row.visit.id,
      visitTitle: row.visit.title,
      visitStartAt: row.visit.startAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      permalink: null,
    }));

    const photos = [...visitPhotos, ...socialPhotos].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return NextResponse.json({ photos, days: DAYS });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Failed to load job photos";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
