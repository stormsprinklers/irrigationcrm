import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const clips = await prisma.voiceClip.findMany({
      where: { companyId: user.companyId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(clips);
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { name, blobUrl, mimeType, durationSec } = body as {
      name?: string;
      blobUrl?: string;
      mimeType?: string;
      durationSec?: number;
    };

    if (!name || !blobUrl || !mimeType) {
      return NextResponse.json({ error: "name, blobUrl, and mimeType are required" }, { status: 400 });
    }

    const clip = await prisma.voiceClip.create({
      data: {
        companyId: user.companyId,
        name,
        blobUrl,
        mimeType,
        durationSec: durationSec ?? null,
      },
    });

    return NextResponse.json(clip, { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
