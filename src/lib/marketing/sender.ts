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
