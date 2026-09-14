import { applyCompanyEmailSignatureText, type CompanySignatureFields } from "@/lib/inbox/company-email-signature";
import { htmlToPlainText } from "@/lib/marketing/link-tracking";
import { escapeEmailHtml, sanitizeEmailHref } from "@/lib/marketing/email-href";
import { isHtmlEmailBody } from "@/lib/marketing/email-templates";
import { appendPlainUnsubscribeFooter, appendPlainUnsubscribeText } from "@/lib/marketing/unsubscribe";

export const DEFAULT_CAMPAIGN_GREETING = "Hey {customer_first_name},";

export function campaignPlainBodyText(
  bodyHtml: string | null | undefined,
  bodyText: string | null | undefined
): string {
  const text = String(bodyText ?? "");
  if (text) return text;
  return htmlToPlainText(bodyHtml ?? "").trim();
}

export function ensureCampaignGreeting(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return `${DEFAULT_CAMPAIGN_GREETING}\n\n`;
  if (/^(hey|hi|hello)\b/i.test(trimmed)) return trimmed;
  return `${DEFAULT_CAMPAIGN_GREETING}\n\n${trimmed}`;
}

export function signatureFieldsFromCompany(company: {
  name: string;
  phone?: string | null;
  supportEmail?: string | null;
  website?: string | null;
  websiteBaseUrl?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): CompanySignatureFields {
  return {
    companyName: company.name,
    phone: company.phone,
    supportEmail: company.supportEmail,
    website: company.website ?? company.websiteBaseUrl,
    address: company.address,
    city: company.city,
    state: company.state,
    zip: company.zip,
  };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Keep the campaign editor's small, email-safe formatting surface on outbound mail. */
function sanitizeCampaignHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|svg|math)[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (tag, rawName: string) => {
      const name = rawName.toLowerCase();
      const closing = /^<\//.test(tag);
      if (!new Set(["p", "div", "br", "strong", "b", "em", "i", "u", "a"]).has(name)) return "";
      if (closing) return name === "br" ? "" : `</${name}>`;
      if (name !== "a") return `<${name}>`;
      const hrefMatch = tag.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const href = sanitizeEmailHref(hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3] ?? "");
      return href
        ? `<a clicktracking=off href="${escapeEmailHtml(href)}" style="color:#1d4ed8;text-decoration:underline">`
        : "<a>";
    });
}

function hasRichFormatting(html: string | null | undefined) {
  return Boolean(html && /<(?:strong|b|em|i|u|a)\b/i.test(html));
}

/** Simple email HTML with a text fallback, company signature, and unsubscribe link. */
export function buildMarketingEmailPayload(params: {
  bodyHtml: string | null | undefined;
  bodyText: string;
  unsubscribeUrl: string;
  recipientId: string;
  publicBaseUrl?: string | null;
  signature?: CompanySignatureFields | null;
}):
  | { text: string; html: string; unbranded: true; omitHtml: false }
  | { text: string; html?: undefined; unbranded: true; omitHtml: true } {
  const body = ensureCampaignGreeting(campaignPlainBodyText(params.bodyHtml, params.bodyText));
  const withSignature = params.signature
    ? applyCompanyEmailSignatureText(body, params.signature) ?? body
    : body;
  const withUnsubscribe = appendPlainUnsubscribeText(withSignature, params.unsubscribeUrl);
  if (!hasRichFormatting(params.bodyHtml)) {
    return {
      text: withUnsubscribe,
      unbranded: true,
      omitHtml: true,
    };
  }

  const richHtml = params.bodyHtml && isHtmlEmailBody(params.bodyHtml)
    ? sanitizeCampaignHtml(params.bodyHtml)
    : "";
  const greetingWasAdded = body !== campaignPlainBodyText(params.bodyHtml, params.bodyText);
  const linkedBody = `${greetingWasAdded ? `<p>${escapeHtml(DEFAULT_CAMPAIGN_GREETING)}</p>` : ""}${richHtml}`;
  const signatureHtml = richHtml && params.signature
    ? `<div style="margin-top:16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;white-space:pre-wrap">${escapeHtml(applyCompanyEmailSignatureText("", params.signature) ?? "")}</div>`
    : "";
  const html = appendPlainUnsubscribeFooter(
    `${linkedBody}${signatureHtml}`,
    escapeHtml(params.unsubscribeUrl)
  ).replace(/<a\s/gi, "<a clicktracking=off ");
  return {
    text: withUnsubscribe,
    html,
    unbranded: true,
    omitHtml: false,
  };
}
