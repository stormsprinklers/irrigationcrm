import { createHmac, timingSafeEqual } from "crypto";
import { getAuthSecret } from "@/lib/auth-secret";
import { getCustomerBaseUrl } from "@/lib/company/customer-url";
import { prisma } from "@/lib/prisma";
import { resolvePortalSlug } from "@/lib/portal/company";

function secret() {
  const value = getAuthSecret();
  if (!value) throw new Error("AUTH_SECRET is required for messaging preference tokens");
  return value;
}

/** Signed token: customerId.companyId.exp.sig */
export function createMessagingPreferencesToken(
  customerId: string,
  companyId: string,
  ttlDays = 365
) {
  const exp = Math.floor(Date.now() / 1000) + ttlDays * 24 * 60 * 60;
  const payload = `${customerId}.${companyId}.${exp}`;
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyMessagingPreferencesToken(token: string): {
  customerId: string;
  companyId: string;
} | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [customerId, companyId, expStr, sig] = parts;
  if (!customerId || !companyId || !expStr || !sig) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null;
  const payload = `${customerId}.${companyId}.${expStr}`;
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return { customerId, companyId };
}

/** @deprecated Use createMessagingPreferencesToken — same token format. */
export const createMarketingUnsubscribeToken = createMessagingPreferencesToken;
/** @deprecated Use verifyMessagingPreferencesToken */
export const verifyMarketingUnsubscribeToken = verifyMessagingPreferencesToken;

export async function messagingPreferencesUrl(customerId: string, companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { portalSlug: true, bookingSlug: true, customerBaseUrl: true },
  });
  const slug = company ? resolvePortalSlug(company) : null;
  const token = createMessagingPreferencesToken(customerId, companyId);
  const base = getCustomerBaseUrl(company);
  if (!slug) {
    return `${base}/api/marketing/unsubscribe?token=${encodeURIComponent(token)}`;
  }
  return `${base}/portal/${slug}/preferences?token=${encodeURIComponent(token)}`;
}

/** Sync helper when slug is already known. */
export function messagingPreferencesUrlWithSlug(
  customerId: string,
  companyId: string,
  slug: string,
  publicBaseUrl?: string | null
) {
  const token = createMessagingPreferencesToken(customerId, companyId);
  const base = getCustomerBaseUrl({ customerBaseUrl: publicBaseUrl ?? null });
  return `${base}/portal/${slug}/preferences?token=${encodeURIComponent(token)}`;
}

export function marketingUnsubscribeUrl(
  customerId: string,
  companyId: string,
  publicBaseUrl?: string | null
) {
  const token = createMessagingPreferencesToken(customerId, companyId);
  const base = getCustomerBaseUrl({ customerBaseUrl: publicBaseUrl ?? null });
  return `${base}/api/marketing/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** Append a preferences footer to marketing campaign HTML. */
export function appendMarketingUnsubscribeFooter(
  html: string,
  preferencesUrl: string
): string {
  const footer = `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#6b7280">
  <p style="margin:0 0 8px">You received this email because you are a customer. This is a marketing message.</p>
  <p style="margin:0"><a href="${preferencesUrl}" style="color:#4C9BC8">Manage email preferences</a> — choose which messages you want to receive.</p>
</div>`;

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${footer}</body>`);
  }
  return `${html}${footer}`;
}

export function appendMessagingPreferencesFooter(
  html: string,
  preferencesUrl: string
): string {
  const footer = `<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#6b7280">
  <p style="margin:0"><a href="${preferencesUrl}" style="color:#4C9BC8">Manage messaging preferences</a></p>
</div>`;

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${footer}</body>`);
  }
  return `${html}${footer}`;
}

export type CustomerMessagingPrefs = {
  marketingEmailOptOut: boolean;
  marketingSmsOptOut: boolean;
  appointmentReminderEmailOptOut: boolean;
  appointmentReminderSmsOptOut: boolean;
  doNotService: boolean;
};

export function prefsAllOptedOut(prefs: {
  marketingEmailOptOut: boolean;
  marketingSmsOptOut: boolean;
  appointmentReminderEmailOptOut: boolean;
  appointmentReminderSmsOptOut: boolean;
}) {
  return (
    prefs.marketingEmailOptOut &&
    prefs.marketingSmsOptOut &&
    prefs.appointmentReminderEmailOptOut &&
    prefs.appointmentReminderSmsOptOut
  );
}

const APPOINTMENT_EVENTS = new Set([
  "VISIT_SCHEDULED",
  "VISIT_TIME_UPDATED",
  "VISIT_CANCELLED",
  "VISIT_COMPLETED",
  "VISIT_EN_ROUTE",
]);

export function isAppointmentReminderEvent(event: string) {
  return APPOINTMENT_EVENTS.has(event);
}
