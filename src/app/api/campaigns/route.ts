import { NextRequest, NextResponse } from "next/server";
import { CampaignChannel, CampaignStatus } from "@prisma/client";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();

    const campaigns = await prisma.campaign.findMany({
      where: { companyId: user.companyId },
      include: {
        list: { select: { id: true, name: true } },
        _count: { select: { recipients: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      campaigns: campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        channel: c.channel,
        status: c.status,
        subject: c.subject,
        list: c.list,
        recipientCount: c._count.recipients,
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
    const { name, channel, subject, bodyText, bodyHtml, listId, scheduledAt } = body;

    if (!name || !channel || !bodyText) {
      return badRequestResponse("name, channel, and bodyText are required");
    }
    if (!Object.values(CampaignChannel).includes(channel)) {
      return badRequestResponse("Invalid channel");
    }

    const campaign = await prisma.campaign.create({
      data: {
        companyId: user.companyId,
        name: String(name),
        channel,
        subject: subject ?? null,
        bodyText: String(bodyText),
        bodyHtml: bodyHtml ?? null,
        listId: listId ?? null,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        status: scheduledAt ? CampaignStatus.SCHEDULED : CampaignStatus.DRAFT,
      },
    });

    return NextResponse.json(campaign, { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
