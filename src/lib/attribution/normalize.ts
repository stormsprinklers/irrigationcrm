import type { AttributionFirstTouchMethod, Prisma } from "@prisma/client";

/** Normalized marketing channel taxonomy used for first-touch + reporting. */
export const ATTRIBUTION_CHANNELS = [
  "google_ads",
  "google_lsa",
  "meta_ads",
  "organic",
  "direct",
  "referral",
  "gbp",
  "other_paid",
  "unknown",
] as const;

export type AttributionChannel = (typeof ATTRIBUTION_CHANNELS)[number];

export const PAID_ATTRIBUTION_CHANNELS: AttributionChannel[] = [
  "google_ads",
  "google_lsa",
  "meta_ads",
  "other_paid",
];

export type AttributionInput = {
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  term?: string | null;
  content?: string | null;
  sourceBucket?: string | null;
  trackingSource?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  msclkid?: string | null;
  leadSource?: string | null;
  formSource?: string | null;
  attributionMethod?: string | null;
};

export type NormalizedAttribution = {
  channel: AttributionChannel;
  displayLabel: string;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  term: string | null;
  content: string | null;
  gclid: string | null;
  fbclid: string | null;
  msclkid: string | null;
  trackingSource: string | null;
};

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function lower(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Map free-form UTMs / tracking labels / LSA match into a stable channel + display label.
 */
export function normalizeAttribution(input: AttributionInput): NormalizedAttribution {
  const source = clean(input.source);
  const medium = clean(input.medium);
  const campaign = clean(input.campaign);
  const term = clean(input.term);
  const content = clean(input.content);
  const trackingSource = clean(input.trackingSource);
  const gclid = clean(input.gclid);
  const fbclid = clean(input.fbclid);
  const msclkid = clean(input.msclkid);
  const bucket = lower(input.sourceBucket);
  const method = lower(input.attributionMethod);
  const tracking = lower(trackingSource);
  const leadSource = lower(input.leadSource ?? input.formSource);

  let channel: AttributionChannel = "unknown";

  if (
    method === "lsa_caller_match" ||
    tracking.includes("lsa") ||
    tracking === "google lsa" ||
    leadSource.includes("lsa") ||
    leadSource === "google lsa"
  ) {
    channel = "google_lsa";
  } else if (gclid || bucket === "google_ads" || tracking.includes("google ads") || tracking.includes("google ppc")) {
    channel = "google_ads";
  } else if (
    fbclid ||
    bucket === "facebook_ads" ||
    bucket === "instagram" ||
    tracking.includes("meta") ||
    tracking.includes("facebook") ||
    tracking.includes("instagram")
  ) {
    channel = "meta_ads";
  } else if (bucket === "google_organic" || (lower(medium) === "organic" && lower(source).includes("google"))) {
    channel = "organic";
  } else if (leadSource === "referral" || bucket === "referral" || lower(medium) === "referral") {
    channel = "referral";
  } else if (
    tracking.includes("gbp") ||
    tracking.includes("google business") ||
    leadSource.includes("gbp") ||
    leadSource.includes("google business")
  ) {
    channel = "gbp";
  } else if (msclkid || lower(medium).includes("cpc") || lower(medium).includes("ppc") || lower(medium) === "paid") {
    channel = "other_paid";
  } else if (bucket === "direct" || (!source && !medium && !trackingSource && !gclid && !fbclid)) {
    channel = bucket === "direct" || (!source && !trackingSource) ? "direct" : "unknown";
  } else if (bucket === "referral") {
    channel = "referral";
  } else if (source || medium || trackingSource) {
    channel = "unknown";
  }

  // Refine direct vs unknown when we only have form source with no UTMs
  if (channel === "unknown" && (leadSource || trackingSource)) {
    if (["contact", "website", "pricing-quote", "commercial-bid", "maintenance-signup"].includes(leadSource)) {
      channel = "direct";
    }
  }

  const displayLabel =
    trackingSource ||
    campaign ||
    (channel === "google_lsa"
      ? "Google LSA"
      : channel === "google_ads"
        ? source || "Google Ads"
        : channel === "meta_ads"
          ? source || "Meta Ads"
          : channel === "organic"
            ? "Organic Search"
            : channel === "referral"
              ? "Referral"
              : channel === "gbp"
                ? "Google Business Profile"
                : channel === "direct"
                  ? clean(input.formSource) || clean(input.leadSource) || "Direct"
                  : source || clean(input.formSource) || clean(input.leadSource) || "Unknown");

  return {
    channel,
    displayLabel,
    source,
    medium,
    campaign,
    term,
    content,
    gclid,
    fbclid,
    msclkid,
    trackingSource,
  };
}

export function isPaidChannel(channel: string | null | undefined): boolean {
  return PAID_ATTRIBUTION_CHANNELS.includes((channel ?? "") as AttributionChannel);
}

export function attributionChannelLabel(channel: string | null | undefined): string {
  switch (channel) {
    case "google_ads":
      return "Google Ads";
    case "google_lsa":
      return "Google LSA";
    case "meta_ads":
      return "Meta Ads";
    case "organic":
      return "Organic";
    case "direct":
      return "Direct";
    case "referral":
      return "Referral";
    case "gbp":
      return "Google Business Profile";
    case "other_paid":
      return "Other paid";
    default:
      return "Unknown";
  }
}

/** Structured first-touch fields shared by Lead and Customer (excludes display label). */
export function firstTouchStructuredData(
  normalized: NormalizedAttribution,
  method: AttributionFirstTouchMethod,
  occurredAt: Date = new Date()
) {
  return {
    attributionChannel: normalized.channel,
    attributionSource: normalized.source,
    attributionMedium: normalized.medium,
    attributionCampaign: normalized.campaign,
    attributionTerm: normalized.term,
    attributionContent: normalized.content,
    gclid: normalized.gclid,
    fbclid: normalized.fbclid,
    msclkid: normalized.msclkid,
    firstTouchAt: occurredAt,
    firstTouchMethod: method,
  };
}

/** Customer update including display `leadSource`. */
export function firstTouchCustomerData(
  normalized: NormalizedAttribution,
  method: AttributionFirstTouchMethod,
  occurredAt: Date = new Date()
): Prisma.CustomerUpdateInput {
  return {
    ...firstTouchStructuredData(normalized, method, occurredAt),
    leadSource: normalized.displayLabel,
  };
}

/** Lead update — keeps existing form `source` when present; otherwise sets display from attribution. */
export function firstTouchLeadData(
  normalized: NormalizedAttribution,
  method: AttributionFirstTouchMethod,
  occurredAt: Date = new Date(),
  existingSource?: string | null
): Prisma.LeadUpdateInput {
  return {
    ...firstTouchStructuredData(normalized, method, occurredAt),
    ...(existingSource
      ? {}
      : { source: normalized.displayLabel }),
  };
}

export function parseAttributionFromMetadata(metadata: unknown): AttributionInput {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }
  const meta = metadata as Record<string, unknown>;
  const nested =
    meta.attribution && typeof meta.attribution === "object" && !Array.isArray(meta.attribution)
      ? (meta.attribution as Record<string, unknown>)
      : meta;

  const str = (key: string) =>
    typeof nested[key] === "string"
      ? (nested[key] as string)
      : typeof meta[key] === "string"
        ? (meta[key] as string)
        : null;

  return {
    source: str("source") ?? str("utm_source"),
    medium: str("medium") ?? str("utm_medium"),
    campaign: str("campaign") ?? str("utm_campaign"),
    term: str("term") ?? str("utm_term"),
    content: str("content") ?? str("utm_content"),
    sourceBucket: str("sourceBucket") ?? str("source_bucket"),
    gclid: str("gclid"),
    fbclid: str("fbclid"),
    msclkid: str("msclkid"),
    trackingSource: str("trackingSource") ?? str("tracking_source"),
  };
}
