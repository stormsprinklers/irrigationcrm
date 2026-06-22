import { NextRequest, NextResponse } from "next/server";
import { CampaignChannel, CampaignStatus, CampaignType } from "@prisma/client";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { previewAudience } from "@/lib/marketing/audience";
import type { AudienceFilters } from "@/lib/marketing/types";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();

    const campaigns = await prisma.campaign.findMany({
      where: { companyId: user.companyId },
      include: {
        list: { select: { id: true, name: true } },
        _count: { select: { recipients: true, enrollments: true } },
        steps: { select: { id: true }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      campaigns: campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        channel: c.channel,
        status: c.status,
        subject: c.subject,
        list: c.list,
        recipientCount: c._count.recipients,
        enrollmentCount: c._count.enrollments,
        stepCount: c.steps.length,
        scheduledAt: c.scheduledAt?.toISOString() ?? null,
        sentAt: c.sentAt?.toISOString() ?? null,
        statsJson: c.statsJson,
        createdAt: c.createdAt.toISOString(),
      })),
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const {
      name,
      type,
      channel,
      subject,
      bodyText,
      bodyHtml,
      listId,
      scheduledAt,
      audienceFilters,
      aiPrompt,
      dripSettings,
      steps,
    } = body;

    if (!name || !channel || !bodyText) {
      return badRequestResponse("name, channel, and bodyText are required");
    }
    if (!Object.values(CampaignChannel).includes(channel)) {
      return badRequestResponse("Invalid channel");
    }

    const campaignType =
      type && Object.values(CampaignType).includes(type) ? type : CampaignType.BLAST;

    const campaign = await prisma.campaign.create({
      data: {
        companyId: user.companyId,
        name: String(name),
        type: campaignType,
        channel,
        subject: subject ?? null,
        bodyText: String(bodyText),
        bodyHtml: bodyHtml ?? null,
        listId: listId ?? null,
        audienceFilters: audienceFilters ?? undefined,
        aiPrompt: aiPrompt ?? null,
        dripSettings: dripSettings ?? undefined,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        status: scheduledAt ? CampaignStatus.SCHEDULED : CampaignStatus.DRAFT,
        steps:
          campaignType === CampaignType.DRIP && Array.isArray(steps)
            ? {
                create: steps.map(
                  (
                    step: {
                      sortOrder: number;
                      channel: CampaignChannel;
                      subject?: string;
                      bodyHtml?: string;
                      bodyText: string;
                      delayDays?: number;
                    },
                    index: number
                  ) => ({
                    sortOrder: step.sortOrder ?? index,
                    channel: step.channel ?? channel,
                    subject: step.subject ?? null,
                    bodyHtml: step.bodyHtml ?? null,
                    bodyText: String(step.bodyText ?? ""),
                    delayDays: step.delayDays ?? 0,
                  })
                ),
              }
            : undefined,
      },
      include: { steps: { orderBy: { sortOrder: "asc" } } },
    });

    if (audienceFilters?.channel && channel) {
      const preview = await previewAudience(
        user.companyId,
        channel,
        audienceFilters as AudienceFilters
      );
      return NextResponse.json({ ...campaign, audiencePreview: preview }, { status: 201 });
    }

    return NextResponse.json(campaign, { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
