import { formatQuoteEstimate } from "@/lib/leads/pricing-quote-enrichment";

function formatQuotedPrice(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "";
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

function originFromWebsite(raw: string | null | undefined): string {
  const trimmed = raw?.trim();
  if (!trimmed) return "";
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol.replace(/\/$/, "");
}

function campaignBookingOverride(raw: unknown): string {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "";
  const url = (raw as Record<string, unknown>).bookingUrl;
  return typeof url === "string" ? url.trim() : "";
}

/** Ballpark shown in the website-form SMS/email. */
export function leadAcknowledgementEstimate(meta: Record<string, unknown>): string {
  const winterization = Boolean(meta.winterization);
  const quoted = formatQuotedPrice(meta.quotedPrice);
  const weekLabel = typeof meta.weekLabel === "string" ? meta.weekLabel.trim() : "";
  if (winterization && quoted) {
    return weekLabel ? `${quoted} for ${weekLabel}` : quoted;
  }

  const formatted =
    typeof meta.formattedEstimate === "string" ? meta.formattedEstimate.trim() : "";
  const soft = asRecord(meta.softEstimate);
  const softLabel = typeof soft.label === "string" ? soft.label.trim() : "";
  const fromQuote = formatQuoteEstimate(
    meta.quote ?? meta.pricing_quote_snapshot ?? meta.pricingQuoteSnapshot ?? meta.selectedOption
  );

  return firstNonEmpty(formatted, softLabel, fromQuote, quoted);
}

export type LeadBookingCompany = {
  websiteBaseUrl?: string | null;
  website?: string | null;
  campaignCtaLinks?: unknown;
  onlineBookingEnabled?: boolean | null;
  bookingSlug?: string | null;
  customerBaseUrl?: string | null;
};

/** Customer booking URL for non-winterization website leads. */
export function resolveLeadAcknowledgementBookingUrl(
  company: LeadBookingCompany,
  meta: Record<string, unknown>
): string {
  if (Boolean(meta.winterization)) return "";

  const campaignUrl = campaignBookingOverride(company.campaignCtaLinks);
  if (campaignUrl) return campaignUrl;

  const websiteOrigin = firstNonEmpty(
    originFromWebsite(company.websiteBaseUrl),
    originFromWebsite(company.website),
    originFromWebsite(process.env.NEXT_PUBLIC_WEBSITE_URL),
    originFromWebsite(process.env.WEBSITE_BASE_URL)
  );
  if (websiteOrigin) return `${websiteOrigin}/booking`;

  const slug = company.bookingSlug?.trim();
  const portalOrigin = originFromWebsite(company.customerBaseUrl);
  if (company.onlineBookingEnabled && slug && portalOrigin) {
    return `${portalOrigin}/book/${slug}`;
  }
  return "";
}

/** SMS/email snippets so empty ballpark/book labels are never sent. */
export function leadAcknowledgementSnippets(
  meta: Record<string, unknown>,
  bookingLink: string
): { estimate_range: string; booking_link: string } {
  const winterization = Boolean(meta.winterization);
  const range = leadAcknowledgementEstimate(meta);
  const link = winterization ? "" : bookingLink.trim();

  if (winterization && range) {
    return {
      estimate_range: ` Quoted ${range}.`,
      booking_link: "",
    };
  }

  return {
    estimate_range: range ? ` Ballpark: ${range}.` : "",
    booking_link: link ? ` Book: ${link}` : "",
  };
}
