import { NextRequest, NextResponse } from "next/server";
import { CampaignStatus, CampaignType } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { buildCampaignStats, uniqueCampaignRecipientCount } from "@/lib/marketing/stats";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const includeArchived = request.nextUrl.searchParams.get("includeArchived") === "1";

    const campaigns = await prisma.campaign.findMany({
      where: {
        companyId: user.companyId,
        ...(includeArchived ? {} : { status: { not: CampaignStatus.ARCHIVED } }),
      },
      include: {
        recipients: {
          select: { id: true, customerId: true, email: true, phone: true, status: true, openedAt: true, clickCount: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const rows = campaigns.map((c) => {
      const stats = buildCampaignStats(c.recipients);
      return {
        id: c.id,
        name: c.name,
        type: c.type,
        channel: c.channel,
        status: c.status,
        sentAt: c.sentAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
        recipientCount: uniqueCampaignRecipientCount(c.recipients),
        sendCount: stats.total ?? 0,
        delivered: stats.delivered,
        opened: stats.opened ?? 0,
        clicked: stats.clicked ?? 0,
        deliveryRate: stats.total ? Math.round((stats.delivered / stats.total) * 1000) / 10 : 0,
        openRate:
          stats.delivered > 0
            ? Math.round(((stats.opened ?? 0) / stats.delivered) * 1000) / 10
            : 0,
        clickRate:
          stats.delivered > 0
            ? Math.round(((stats.clicked ?? 0) / stats.delivered) * 1000) / 10
            : 0,
      };
    });

    const emailCampaigns = rows.filter((c) => c.channel === "EMAIL" && c.sendCount > 0);
    const totals = emailCampaigns.reduce(
      (acc, c) => {
        acc.sends += c.sendCount;
        acc.delivered += c.delivered;
        acc.opened += c.opened;
        acc.clicked += c.clicked;
        return acc;
      },
      { sends: 0, delivered: 0, opened: 0, clicked: 0 }
    );

    return NextResponse.json({
      summary: {
        campaignCount: campaigns.length,
        activeDrip: campaigns.filter(
          (c) => c.type === CampaignType.DRIP && c.status === "ACTIVE"
        ).length,
        deliveryRate:
          totals.sends > 0 ? Math.round((totals.delivered / totals.sends) * 1000) / 10 : 0,
        openRate:
          totals.delivered > 0
            ? Math.round((totals.opened / totals.delivered) * 1000) / 10
            : 0,
        clickRate:
          totals.delivered > 0
            ? Math.round((totals.clicked / totals.delivered) * 1000) / 10
            : 0,
      },
      campaigns: rows,
    });
  } catch {
    return unauthorizedResponse();
  }
}
