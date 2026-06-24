import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ token: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { token } = await params;
  const record = await prisma.feedbackSurveyToken.findUnique({
    where: { token },
    include: {
      visit: {
        include: {
          company: { select: { name: true, portalSlug: true, bookingSlug: true } },
          customer: { select: { name: true } },
        },
      },
    },
  });

  if (!record || record.expiresAt < new Date()) {
    return NextResponse.json({ error: "Survey link expired or invalid" }, { status: 404 });
  }

  return NextResponse.json({
    companyName: record.visit.company.name,
    customerName: record.visit.customer?.name ?? "Customer",
    visitTitle: record.visit.title,
    alreadySubmitted: Boolean(record.usedAt),
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { token } = await params;
  const body = await request.json();
  const rating = Number(body.rating);
  const comment = typeof body.comment === "string" ? body.comment.trim() : "";

  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Rating must be between 1 and 5" }, { status: 400 });
  }

  const record = await prisma.feedbackSurveyToken.findUnique({
    where: { token },
    include: { visit: { select: { id: true, companyId: true, customerId: true } } },
  });

  if (!record || record.expiresAt < new Date()) {
    return NextResponse.json({ error: "Survey link expired or invalid" }, { status: 404 });
  }
  if (record.usedAt) {
    return NextResponse.json({ error: "Survey already submitted" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.feedbackSurveyResponse.create({
      data: {
        companyId: record.visit.companyId,
        visitId: record.visit.id,
        customerId: record.visit.customerId,
        tokenId: record.id,
        rating,
        comment: comment || null,
      },
    }),
    prisma.feedbackSurveyToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
