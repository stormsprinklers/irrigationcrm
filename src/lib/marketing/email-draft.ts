import type { CompanySignatureFields } from "@/lib/inbox/company-email-signature";

export const DEFAULT_CAMPAIGN_GREETING = "Hey {customer_first_name},";

export function htmlToPlainText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => {
      const text = String(inner)
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .trim();
      if (!text || text === href) return String(href);
      return `${text} (${href})`;
    })
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

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
