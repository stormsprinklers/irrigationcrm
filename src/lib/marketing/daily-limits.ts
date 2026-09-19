import type { CampaignChannel, Prisma } from "@prisma/client";

type FlowNodeSummary = { id: string; type: string };

export function isInitialChannelOutreachNode(
  nodes: FlowNodeSummary[],
  nodeId: string,
  channel: CampaignChannel
) {
  const sendType = channel === "SMS" ? "SEND_SMS" : "SEND_EMAIL";
  return nodes.find((node) => node.type === sendType)?.id === nodeId;
}

/** Count the first outreach node only; replies and follow-ups do not use its allowance. */
export function campaignDailySentWhere(params: {
  campaignId: string;
  channel: CampaignChannel;
  flowNodeId: string;
  startOfDay: Date;
}): Prisma.CampaignRecipientWhereInput {
  return {
    campaignId: params.campaignId,
    channel: params.channel,
    flowNodeId: params.flowNodeId,
    sentAt: { gte: params.startOfDay },
    status: { in: ["sent", "delivered"] },
  };
}
