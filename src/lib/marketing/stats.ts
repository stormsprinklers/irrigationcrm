import type { CampaignStats } from "@/lib/marketing/types";

type RecipientRow = {
  status: string;
  openedAt?: Date | null;
  clickCount?: number;
};

export function buildCampaignStats(recipients: RecipientRow[]): CampaignStats {
  const total = recipients.length;
  const delivered = recipients.filter((r) => r.status === "delivered").length;
  const sent = recipients.filter((r) => r.status === "sent" || r.status === "delivered").length;
  const failed = recipients.filter((r) => r.status === "failed" || r.status === "opt_out").length;
  const pending = recipients.filter((r) => r.status === "pending").length;
  const opened = recipients.filter((r) => r.openedAt != null).length;
  const clicked = recipients.filter((r) => (r.clickCount ?? 0) > 0).length;

  return { total, sent, delivered, failed, pending, opened, clicked };
}

export function rate(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}
