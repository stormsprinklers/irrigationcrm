import { NextRequest, NextResponse } from "next/server";
import { CampaignStatus, CampaignType } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import {
  archiveCampaign,
  assertCampaignEditable,
  unarchiveCampaign,
} from "@/lib/marketing/campaign-actions";
import { isCampaignEditable } from "@/lib/marketing/campaign-lifecycle";
import { withSanitizedCampaignSenderName } from "@/lib/marketing/sender";
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
        flowNodes: { orderBy: { sortOrder: "asc" } },
        enrollments: {
          select: {
            id: true,
            status: true,
            currentStepIndex: true,
            currentNodeId: true,
            nextSendAt: true,
            customer: { select: { id: true, name: true, email: true } },
          },
          take: 200,
          orderBy: { updatedAt: "desc" },
        },
        recipients: {
          orderBy: { sentAt: "desc" },
          take: 500,
        },
      },
    });

    if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

    let flowMetrics = null;
    let performance = null;
    try {
      const { getCampaignFlowMetrics } = await import("@/lib/marketing/flow-engine");
      flowMetrics = await getCampaignFlowMetrics(id);
    } catch {
      flowMetrics = null;
    }
    try {
      const { getCampaignPerformance } = await import("@/lib/marketing/campaign-performance");
      performance = await getCampaignPerformance(id);
    } catch {
      performance = null;
    }

    return NextResponse.json({
      ...campaign,
      audienceFilters: campaign.audienceFilters,
      dripSettings: campaign.dripSettings,
      scheduledAt: campaign.scheduledAt?.toISOString() ?? null,
      sentAt: campaign.sentAt?.toISOString() ?? null,
      createdAt: campaign.createdAt.toISOString(),
      updatedAt: campaign.updatedAt.toISOString(),
      flowMetrics,
      performance,
      recipients: campaign.recipients.map((r) => ({
        ...r,
        sentAt: r.sentAt?.toISOString() ?? null,
        deliveredAt: r.deliveredAt?.toISOString() ?? null,
        openedAt: r.openedAt?.toISOString() ?? null,
        clickedAt: r.clickedAt?.toISOString() ?? null,
      })),
      enrollments: campaign.enrollments.map((e) => ({
        ...e,
        nextSendAt: e.nextSendAt ? e.nextSendAt.toISOString() : null,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load campaign" },
      { status: 500 }
    );
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

    if (body.status === "ARCHIVED") {
      const archived = await archiveCampaign(user.companyId, id);
      return NextResponse.json(archived);
    }
    if (body.status === "DRAFT" && existing.status === CampaignStatus.ARCHIVED) {
      const restored = await unarchiveCampaign(user.companyId, id);
      return NextResponse.json(restored);
    }

    if (!isCampaignEditable(existing.status)) {
      try {
        assertCampaignEditable(existing.status);
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : "Campaign is closed" },
          { status: 409 }
        );
      }
    }

    const audienceFiltersChanged =
      body.audienceFilters !== undefined &&
      JSON.stringify(existing.audienceFilters ?? null) !==
        JSON.stringify(body.audienceFilters ?? null);

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = String(body.name);
    if (body.type !== undefined && existing.status === CampaignStatus.DRAFT) {
      if (body.type !== CampaignType.BLAST) data.type = body.type;
    }
    if (body.channel !== undefined && existing.status === CampaignStatus.DRAFT) {
      data.channel = body.channel;
    }
    if (body.subject !== undefined) data.subject = body.subject;
    if (body.bodyText !== undefined) data.bodyText = String(body.bodyText);
    if (body.bodyHtml !== undefined) data.bodyHtml = body.bodyHtml;
    if (body.listId !== undefined) data.listId = body.listId;
    if (body.audienceFilters !== undefined) data.audienceFilters = body.audienceFilters;
    if (body.aiPrompt !== undefined) data.aiPrompt = body.aiPrompt;
    if (body.dripSettings !== undefined) {
      data.dripSettings = withSanitizedCampaignSenderName(body.dripSettings);
    }
    if (body.scheduledAt !== undefined) {
      data.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    }

    const campaign = await prisma.campaign.update({
      where: { id },
      data,
      include: { steps: { orderBy: { sortOrder: "asc" } } },
    });

    let audienceReconciliation = null;
    if (
      audienceFiltersChanged &&
      existing.status === CampaignStatus.ACTIVE &&
      existing.type === CampaignType.DRIP
    ) {
      const { reconcileActiveCampaignAudience } = await import(
        "@/lib/marketing/campaign-audience-reconciliation"
      );
      audienceReconciliation = await reconcileActiveCampaignAudience(id);
    }

    return NextResponse.json({ ...campaign, audienceReconciliation });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update campaign" },
      { status: 500 }
    );
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
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not delete campaign" },
      { status: 500 }
    );
  }
}
