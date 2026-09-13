import { getDefaultFromEmail } from "@/lib/inbox/email";

export type MarketingSenderCompany = {
  twilioPhone?: string | null;
  marketingTwilioPhone?: string | null;
  sendgridFrom?: string | null;
  marketingSendgridFrom?: string | null;
};

/** Prefer dedicated marketing SMS number, then company Twilio phone. */
export function resolveMarketingSmsFrom(company: MarketingSenderCompany): string | null {
  const marketing = company.marketingTwilioPhone?.trim();
  if (marketing) return marketing;
  const fallback = company.twilioPhone?.trim();
  return fallback || null;
}

/** Prefer dedicated marketing from-address, then SendGrid from, then app default. */
export function resolveMarketingEmailFrom(company: MarketingSenderCompany): string | null {
  const marketing = company.marketingSendgridFrom?.trim();
  if (marketing) return marketing;
  const fallback = company.sendgridFrom?.trim();
  if (fallback) return fallback;
  return getDefaultFromEmail() || null;
}

/** Inbox From display names: RFC 5322 practical length, no line breaks. */
const SENDER_NAME_MAX_LENGTH = 78;

export function sanitizeMarketingSenderName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, SENDER_NAME_MAX_LENGTH);
}

export function campaignSenderNameFromSettings(dripSettings: unknown): string | null {
  if (!dripSettings || typeof dripSettings !== "object" || Array.isArray(dripSettings)) return null;
  return sanitizeMarketingSenderName((dripSettings as { senderName?: unknown }).senderName);
}

export function withSanitizedCampaignSenderName(dripSettings: unknown): unknown {
  if (!dripSettings || typeof dripSettings !== "object" || Array.isArray(dripSettings)) {
    return dripSettings;
  }
  const next = { ...(dripSettings as Record<string, unknown>) };
  if (!("senderName" in next)) return next;
  const sanitized = sanitizeMarketingSenderName(next.senderName);
  if (sanitized) next.senderName = sanitized;
  else delete next.senderName;
  return next;
}

/** Inbox From display name: campaign override, then company sender name, then business name. */
export function resolveMarketingSenderName(params: {
  dripSettings?: unknown;
  companySenderName?: string | null;
  companyName: string;
}): string {
  return (
    campaignSenderNameFromSettings(params.dripSettings) ||
    params.companySenderName?.trim() ||
    params.companyName.trim() ||
    "Support"
  );
}
