import type { CampaignChannel } from "@prisma/client";

type FlowNodeChannelSource = { type: string };

export function campaignFlowChannels(nodes: FlowNodeChannelSource[]): CampaignChannel[] {
  const channels: CampaignChannel[] = [];
  if (nodes.some((node) => node.type === "SEND_EMAIL")) channels.push("EMAIL");
  if (nodes.some((node) => node.type === "SEND_SMS")) channels.push("SMS");
  return channels;
}

export function unavailableCampaignChannelReason(
  customer: {
    email?: string | null;
    phone?: string | null;
    marketingEmailOptOut?: boolean;
    marketingSmsOptOut?: boolean;
  },
  channel: CampaignChannel
): string | null {
  if (channel === "EMAIL") {
    if (!customer.email?.trim()) return "missing_email";
    if (customer.marketingEmailOptOut) return "email_opted_out";
    return null;
  }
  if (!customer.phone?.trim()) return "missing_phone";
  if (customer.marketingSmsOptOut) return "sms_opted_out";
  return null;
}
