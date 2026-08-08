import { getAppBaseUrl } from "@/lib/app-url";

export type CampaignCustomLink = {
  id: string;
  label: string;
  url: string;
};

export type CampaignCtaLinksStored = {
  bookingUrl?: string | null;
  custom?: CampaignCustomLink[];
};

export type CampaignAllowedLink = {
  key: string;
  label: string;
  url: string;
  builtin: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseCampaignCtaLinks(raw: unknown): CampaignCtaLinksStored {
  if (!isRecord(raw)) return { custom: [] };
  const customRaw = Array.isArray(raw.custom) ? raw.custom : [];
  const custom: CampaignCustomLink[] = [];
  for (const item of customRaw) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const label = typeof item.label === "string" ? item.label.trim() : "";
    const url = typeof item.url === "string" ? item.url.trim() : "";
    if (!id || !label || !url) continue;
    custom.push({ id, label, url });
  }
  return {
    bookingUrl: typeof raw.bookingUrl === "string" ? raw.bookingUrl.trim() : null,
    custom,
  };
}

export function resolveBookingUrl(params: {
  bookingUrlOverride?: string | null;
  bookingSlug?: string | null;
  websiteBaseUrl?: string | null;
}): string | null {
  const override = params.bookingUrlOverride?.trim();
  if (override) return override;
  const slug = params.bookingSlug?.trim();
  if (!slug) return null;
  const base =
    params.websiteBaseUrl?.trim().replace(/\/$/, "") ||
    getAppBaseUrl();
  return `${base}/book/${slug}`;
}

/** Flatten built-in + custom links for AI and UI. */
export function resolveCampaignAllowedLinks(params: {
  campaignCtaLinks?: unknown;
  bookingSlug?: string | null;
  websiteBaseUrl?: string | null;
  privacyPolicyUrl?: string | null;
  termsOfServiceUrl?: string | null;
}): CampaignAllowedLink[] {
  const stored = parseCampaignCtaLinks(params.campaignCtaLinks);
  const links: CampaignAllowedLink[] = [];

  const bookingUrl = resolveBookingUrl({
    bookingUrlOverride: stored.bookingUrl,
    bookingSlug: params.bookingSlug,
    websiteBaseUrl: params.websiteBaseUrl,
  });
  if (bookingUrl) {
    links.push({ key: "booking", label: "Booking", url: bookingUrl, builtin: true });
  }

  const privacy = params.privacyPolicyUrl?.trim();
  if (privacy) {
    links.push({
      key: "privacy",
      label: "Privacy policy",
      url: privacy,
      builtin: true,
    });
  }

  const terms = params.termsOfServiceUrl?.trim();
  if (terms) {
    links.push({
      key: "terms",
      label: "Terms of service",
      url: terms,
      builtin: true,
    });
  }

  for (const custom of stored.custom ?? []) {
    links.push({
      key: `custom:${custom.id}`,
      label: custom.label,
      url: custom.url,
      builtin: false,
    });
  }

  return links;
}

export function sanitizeCampaignCtaLinksInput(body: {
  bookingUrl?: string | null;
  custom?: Array<{ id?: string; label?: string; url?: string }>;
}): CampaignCtaLinksStored {
  const custom: CampaignCustomLink[] = [];
  for (const item of body.custom ?? []) {
    const label = typeof item.label === "string" ? item.label.trim() : "";
    const url = typeof item.url === "string" ? item.url.trim() : "";
    if (!label || !url) continue;
    const id =
      typeof item.id === "string" && item.id.trim()
        ? item.id.trim()
        : `link_${custom.length + 1}_${Date.now().toString(36)}`;
    custom.push({ id, label, url });
  }
  const bookingUrl =
    typeof body.bookingUrl === "string" && body.bookingUrl.trim()
      ? body.bookingUrl.trim()
      : null;
  return { bookingUrl, custom };
}
