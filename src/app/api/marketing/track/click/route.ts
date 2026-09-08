import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const recipientId = request.nextUrl.searchParams.get("r");
  const encodedUrl = request.nextUrl.searchParams.get("u");

  if (!recipientId || !encodedUrl) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  let targetUrl: string;
  try {
    targetUrl = decodeURIComponent(encodedUrl);
  } catch {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const recipient = await prisma.campaignRecipient.findUnique({
    where: { id: recipientId },
  });
  if (!recipient) {
    return NextResponse.redirect(targetUrl);
  }

  await prisma.campaignRecipient.update({
    where: { id: recipientId },
    data: {
      clickCount: { increment: 1 },
      clickedAt: recipient.clickedAt ?? new Date(),
    },
  });

  if (recipient.customerId) {
    void import("@/lib/marketing/flow-engine")
      .then(({ advanceWaitOnTrackedAction }) =>
        advanceWaitOnTrackedAction({
          campaignId: recipient.campaignId,
          customerId: recipient.customerId!,
          kind: "clicked",
        })
      )
      .catch((err) => console.error("Campaign wait click check failed", err));
  }

  const all = await prisma.campaignRecipient.findMany({
    where: { campaignId: recipient.campaignId },
    select: { status: true, openedAt: true, clickCount: true },
  });
  const campaign = await prisma.campaign.findUnique({
    where: { id: recipient.campaignId },
    select: { statsJson: true },
  });
  const { buildCampaignStats, mergeCampaignStatsJson } = await import("@/lib/marketing/stats");
  const stats = mergeCampaignStatsJson(campaign?.statsJson, buildCampaignStats(all), targetUrl);
  await prisma.campaign.update({
    where: { id: recipient.campaignId },
    data: { statsJson: stats },
  });

  return NextResponse.redirect(targetUrl);
}
