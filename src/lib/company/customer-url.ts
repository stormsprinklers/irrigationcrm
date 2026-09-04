import { getAppBaseUrl } from "@/lib/app-url";
import { resolvePortalSlug } from "@/lib/portal/company";

export type CustomerUrlCompany = {
  customerBaseUrl?: string | null;
  portalSlug?: string | null;
  bookingSlug?: string | null;
};

function stripTrailingSlash(url: string) {
  return url.replace(/\/$/, "");
}

/** Validate a settings value. Empty becomes null (use the default CRM host). */
export function parseCustomerBaseUrlInput(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== "string") {
    throw new Error("Enter a domain like portal.utah.christmas");
  }
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error("Enter a valid domain like portal.utah.christmas");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Customer domain must use https");
  }

  const host = parsed.hostname.toLowerCase();
  const isLocal = host === "localhost" || host === "127.0.0.1";
  if (!host || (!isLocal && !host.includes("."))) {
    throw new Error("Enter a full domain like portal.utah.christmas");
  }
  if (parsed.pathname && parsed.pathname !== "/") {
    throw new Error("Enter only the domain, not a path");
  }
  if (parsed.search || parsed.hash || parsed.username || parsed.password) {
    throw new Error("Enter only the domain, not a path");
  }

  const protocol = isLocal ? parsed.protocol : "https:";
  const port = parsed.port ? `:${parsed.port}` : "";
  return `${protocol}//${host}${port}`;
}

/** Origin used in customer SMS/email/portal links for this company. */
export function getCustomerBaseUrl(
  company?: { customerBaseUrl?: string | null } | null
): string {
  const stored = company?.customerBaseUrl?.trim();
  if (stored) return stripTrailingSlash(stored);
  return getAppBaseUrl();
}

export function customerPublicUrl(
  company: { customerBaseUrl?: string | null } | null | undefined,
  path: string
): string {
  const base = getCustomerBaseUrl(company);
  const next = path.startsWith("/") ? path : `/${path}`;
  return `${base}${next}`;
}

export function customerPortalHomeUrl(company: CustomerUrlCompany | null | undefined): string {
  const slug = company ? resolvePortalSlug(company) : null;
  if (!slug) return getCustomerBaseUrl(company);
  return customerPublicUrl(company, `/portal/${slug}`);
}

export function customerEstimateUrl(
  company: CustomerUrlCompany | null | undefined,
  publicToken: string,
  estimateId?: string
): string {
  const slug = company ? resolvePortalSlug(company) : null;
  if (slug) {
    return customerPublicUrl(company, `/portal/${slug}/estimates/${publicToken}`);
  }
  return customerPublicUrl(company, `/estimates/${estimateId || publicToken}`);
}

export function customerInvoicePayUrl(
  company: { customerBaseUrl?: string | null } | null | undefined,
  publicToken: string
): string {
  const custom = company?.customerBaseUrl?.trim();
  if (custom) return customerPublicUrl(company, `/pay/${publicToken}`);
  const configured =
    process.env.NEXT_PUBLIC_PAY_URL?.trim() || process.env.PAY_BASE_URL?.trim();
  if (configured) {
    return `${stripTrailingSlash(configured)}/pay/${publicToken}`;
  }
  return customerPublicUrl(company, `/pay/${publicToken}`);
}

export function customerBookingUrl(company: CustomerUrlCompany | null | undefined): string | null {
  const slug = company?.bookingSlug?.trim();
  if (!slug) return null;
  return customerPublicUrl(company, `/book/${slug}`);
}

export function customerLiveTrackUrl(
  company: CustomerUrlCompany | null | undefined,
  token: string
): string | null {
  const slug = company ? resolvePortalSlug(company) : null;
  if (!slug || !token) return null;
  return customerPublicUrl(company, `/portal/${slug}/track/${token}`);
}

export function customerSurveyUrl(
  company: CustomerUrlCompany | null | undefined,
  surveyToken: string
): string | null {
  const slug = company ? resolvePortalSlug(company) : null;
  if (!slug) return null;
  return customerPublicUrl(company, `/portal/${slug}/feedback/${surveyToken}`);
}

export function customerPortalVerifyUrl(
  company: { customerBaseUrl?: string | null } | null | undefined,
  rawToken: string,
  slug: string
): string {
  return customerPublicUrl(
    company,
    `/api/portal/auth/verify?token=${encodeURIComponent(rawToken)}&slug=${encodeURIComponent(slug)}`
  );
}
