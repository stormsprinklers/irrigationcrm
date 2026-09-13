import { applyCompanyEmailSignatureText, type CompanySignatureFields } from "@/lib/inbox/company-email-signature";
import { htmlToPlainText, rewriteTrackedUrlsInText } from "@/lib/marketing/link-tracking";
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

/** Simple email HTML with a text fallback, company signature, and unsubscribe link. */
export function buildMarketingEmailPayload(params: {
  bodyHtml: string | null | undefined;
  bodyText: string;
  unsubscribeUrl: string;
  recipientId: string;
  publicBaseUrl?: string | null;
  signature?: CompanySignatureFields | null;
}): { text: string; html: string; unbranded: true; omitHtml: false } {
  const body = ensureCampaignGreeting(campaignPlainBodyText(params.bodyHtml, params.bodyText));
  const withSignature = params.signature
    ? applyCompanyEmailSignatureText(body, params.signature) ?? body
    : body;
  const withUnsubscribe = appendPlainUnsubscribeText(withSignature, params.unsubscribeUrl);
  // Escape typed content before adding links; preserve line breaks and spacing.
  const linkedBody = withSignature.split(/(https?:\/\/[^\s<>"']+)/gi).map((part, index) => {
    if (index % 2 === 0) return escapeHtml(part);
    const trailing = part.match(/[).,;:!?]+$/)?.[0] ?? "";
    const url = trailing ? part.slice(0, -trailing.length) : part;
    const href = rewriteTrackedUrlsInText(url, params.recipientId);
    return `<a href="${escapeHtml(href)}">${escapeHtml(url)}</a>${escapeHtml(trailing)}`;
  }).join("");
  const html = appendPlainUnsubscribeFooter(
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;white-space:pre-wrap">${linkedBody}</div>`,
    escapeHtml(params.unsubscribeUrl)
  );
  return {
    text: rewriteTrackedUrlsInText(withUnsubscribe, params.recipientId),
    html,
    unbranded: true,
    omitHtml: false,
  };
}
