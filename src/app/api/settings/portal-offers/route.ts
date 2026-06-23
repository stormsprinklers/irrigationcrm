import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse, forbiddenResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") return forbiddenResponse();

    const offers = await prisma.portalOffer.findMany({
      where: { companyId: user.companyId },
      orderBy: { sortOrder: "asc" },
    });
    return NextResponse.json({ offers });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") return forbiddenResponse();

    const body = await request.json();
    const title = String(body.title ?? "").trim();
    if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

    const offer = await prisma.portalOffer.create({
      data: {
        companyId: user.companyId,
        title,
        description: body.description ? String(body.description) : null,
        imageUrl: body.imageUrl ? String(body.imageUrl) : null,
        ctaLabel: body.ctaLabel ? String(body.ctaLabel) : null,
        ctaUrl: body.ctaUrl ? String(body.ctaUrl) : null,
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        active: body.active !== false,
        sortOrder: Number(body.sortOrder) || 0,
        targeting: body.targeting ?? null,
      },
    });

    return NextResponse.json(offer, { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
