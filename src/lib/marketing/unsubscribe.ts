import { createHmac, timingSafeEqual } from "crypto";
import { getAuthSecret } from "@/lib/auth-secret";
import { getAppBaseUrl } from "@/lib/app-url";

function secret() {
  const value = getAuthSecret();
  if (!value) throw new Error("AUTH_SECRET is required for marketing unsubscribe tokens");
  return value;
}

/** Signed token: customerId.companyId.exp.sig */
export function createMarketingUnsubscribeToken(
  customerId: string,
  companyId: string,
  ttlDays = 365
) {
  const exp = Math.floor(Date.now() / 1000) + ttlDays * 24 * 60 * 60;
  const payload = `${customerId}.${companyId}.${exp}`;
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyMarketingUnsubscribeToken(token: string): {
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

export function marketingUnsubscribeUrl(customerId: string, companyId: string) {
  const token = createMarketingUnsubscribeToken(customerId, companyId);
  return `${getAppBaseUrl()}/api/marketing/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** Append a marketing-only unsubscribe footer to campaign HTML. */
export function appendMarketingUnsubscribeFooter(
  html: string,
  unsubscribeUrl: string
): string {
  const footer = `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#6b7280">
  <p style="margin:0 0 8px">You received this email because you are a customer. This is a marketing message.</p>
  <p style="margin:0"><a href="${unsubscribeUrl}" style="color:#4C9BC8">Unsubscribe from marketing emails</a> — you will still receive appointment and invoice messages.</p>
</div>`;

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${footer}</body>`);
  }
  return `${html}${footer}`;
}
