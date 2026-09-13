import { applyCompanyEmailSignatureText, type CompanySignatureFields } from "@/lib/inbox/company-email-signature";
import { htmlToPlainText, rewriteTrackedUrlsInText } from "@/lib/marketing/link-tracking";
import { appendPlainUnsubscribeText } from "@/lib/marketing/unsubscribe";

export const DEFAULT_CAMPAIGN_GREETING = "Hey {customer_first_name},";

export function campaignPlainBodyText(
  bodyHtml: string | null | undefined,
  bodyText: string | null | undefined
): string {
  const text = String(bodyText ?? "").trim();
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

/** Build a native plaintext campaign: greeting, body, company signature, unsubscribe URL. */
export function buildMarketingEmailPayload(params: {
  bodyHtml: string | null | undefined;
  bodyText: string;
  unsubscribeUrl: string;
  recipientId: string;
  publicBaseUrl?: string | null;
  signature?: CompanySignatureFields | null;
}): { text: string; html?: undefined; unbranded: true; omitHtml: true } {
  const body = ensureCampaignGreeting(campaignPlainBodyText(params.bodyHtml, params.bodyText));
  const withSignature = params.signature
    ? applyCompanyEmailSignatureText(body, params.signature) ?? body
    : body;
  const withUnsubscribe = appendPlainUnsubscribeText(withSignature, params.unsubscribeUrl);
  return {
    text: rewriteTrackedUrlsInText(withUnsubscribe, params.recipientId),
    unbranded: true,
    omitHtml: true,
  };
}
