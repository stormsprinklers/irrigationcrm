import { prisma } from "@/lib/prisma";
import { buildCampaignStats, mergeCampaignStatsJson } from "@/lib/marketing/stats";

export async function trackCampaignEngagement(params: {
  recipientId: string;
  kind: "opened" | "clicked";
  clickUrl?: string;
}): Promise<{ found: boolean }> {
  const recipient = await prisma.campaignRecipient.findUnique({
    where: { id: params.recipientId },
  });
  if (!recipient) return { found: false };

  const now = new Date();
  const data: {
    openedAt?: Date;
    clickedAt?: Date;
    clickCount?: { increment: number };
    status?: string;
    deliveredAt?: Date;
  } = {};

  if (!recipient.openedAt) data.openedAt = now;
  if (params.kind === "clicked") {
    data.clickedAt = recipient.clickedAt ?? now;
    data.clickCount = { increment: 1 };
  }
  if (recipient.status === "sent") {
    data.status = "delivered";
    data.deliveredAt = recipient.deliveredAt ?? now;
  }

  if (params.kind === "opened" && recipient.openedAt && recipient.status !== "sent") {
    return { found: true };
  }

  if (Object.keys(data).length > 0) {
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data,
    });
  }

  const all = await prisma.campaignRecipient.findMany({
    where: { campaignId: recipient.campaignId },
    select: { status: true, openedAt: true, clickCount: true },
  });
  const campaign = await prisma.campaign.findUnique({
    where: { id: recipient.campaignId },
    select: { statsJson: true },
  });
  const stats = mergeCampaignStatsJson(
    campaign?.statsJson,
    buildCampaignStats(all),
    params.clickUrl
  );
  await prisma.campaign.update({
    where: { id: recipient.campaignId },
    data: { statsJson: stats },
  });

  if (recipient.customerId && (params.kind === "opened" || params.kind === "clicked")) {
    void import("@/lib/marketing/flow-engine")
      .then(({ advanceWaitOnTrackedAction }) =>
        advanceWaitOnTrackedAction({
          campaignId: recipient.campaignId,
          customerId: recipient.customerId!,
          kind: params.kind,
        })
      )
      .catch((err) => console.error("Campaign wait action check failed", err));
  }

  return { found: true };
}
