import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;

    const campaign = await prisma.campaign.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        list: { select: { id: true, name: true } },
        steps: { orderBy: { sortOrder: "asc" } },
        enrollments: {
          select: { id: true, status: true, currentStepIndex: true, nextSendAt: true },
          take: 100,
        },
        recipients: {
          orderBy: { sentAt: "desc" },
          take: 500,
        },
      },
    });

    if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
      ...campaign,
      audienceFilters: campaign.audienceFilters,
      dripSettings: campaign.dripSettings,
      scheduledAt: campaign.scheduledAt?.toISOString() ?? null,
      sentAt: campaign.sentAt?.toISOString() ?? null,
      createdAt: campaign.createdAt.toISOString(),
      updatedAt: campaign.updatedAt.toISOString(),
      recipients: campaign.recipients.map((r) => ({
        ...r,
        sentAt: r.sentAt?.toISOString() ?? null,
        deliveredAt: r.deliveredAt?.toISOString() ?? null,
        openedAt: r.openedAt?.toISOString() ?? null,
        clickedAt: r.clickedAt?.toISOString() ?? null,
      })),
      enrollments: campaign.enrollments.map((e) => ({
        ...e,
        nextSendAt: e.nextSendAt.toISOString(),
      })),
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.campaign.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = String(body.name);
    if (body.type !== undefined) data.type = body.type;
    if (body.subject !== undefined) data.subject = body.subject;
    if (body.bodyText !== undefined) data.bodyText = String(body.bodyText);
    if (body.bodyHtml !== undefined) data.bodyHtml = body.bodyHtml;
    if (body.listId !== undefined) data.listId = body.listId;
    if (body.audienceFilters !== undefined) data.audienceFilters = body.audienceFilters;
    if (body.aiPrompt !== undefined) data.aiPrompt = body.aiPrompt;
    if (body.dripSettings !== undefined) data.dripSettings = body.dripSettings;
    if (body.scheduledAt !== undefined) {
      data.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    }

    const campaign = await prisma.campaign.update({
      where: { id },
      data,
      include: { steps: { orderBy: { sortOrder: "asc" } } },
    });

    return NextResponse.json(campaign);
  } catch {
    return unauthorizedResponse();
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;

    const existing = await prisma.campaign.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.campaign.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
