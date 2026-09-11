import type { CampaignStats } from "@/lib/marketing/types";
import { phoneDigitsKey } from "@/lib/inbox/phone";

type RecipientRow = {
  status: string;
  openedAt?: Date | null;
  clickCount?: number;
};

export type CampaignStatsJson = CampaignStats & {
  linkClicks?: Record<string, number>;
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

/** One person can have an email row and an SMS row; count them once. */
export function campaignRecipientKey(row: {
  id?: string;
  customerId?: string | null;
  email?: string | null;
  phone?: string | null;
}) {
  return (
    row.customerId ||
    row.email?.trim().toLowerCase() ||
    phoneDigitsKey(row.phone) ||
    row.id ||
    ""
  );
}

export function uniqueCampaignRecipientCount(
  rows: Array<{
    id?: string;
    customerId?: string | null;
    email?: string | null;
    phone?: string | null;
  }>
) {
  const keys = new Set<string>();
  for (const row of rows) {
    const key = campaignRecipientKey(row);
    if (key) keys.add(key);
  }
  return keys.size;
}

export function rate(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function rateOrNull(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function mergeCampaignStatsJson(
  existing: unknown,
  next: CampaignStats,
  extraClickUrl?: string
): CampaignStatsJson {
  const prev = existing && typeof existing === "object" ? (existing as Record<string, unknown>) : {};
  const linkClicks: Record<string, number> = {
    ...((prev.linkClicks && typeof prev.linkClicks === "object"
      ? prev.linkClicks
      : {}) as Record<string, number>),
  };
  if (extraClickUrl) {
    linkClicks[extraClickUrl] = (linkClicks[extraClickUrl] ?? 0) + 1;
  }
  return Object.keys(linkClicks).length > 0 ? { ...next, linkClicks } : next;
}
