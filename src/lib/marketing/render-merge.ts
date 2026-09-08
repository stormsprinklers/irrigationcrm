import { buildNotificationContext } from "@/lib/notifications/context";
import { renderTemplate } from "@/lib/notifications/templates";

export type MarketingMergeCompany = {
  name: string;
  phone?: string | null;
  timezone?: string | null;
  portalSlug?: string | null;
  bookingSlug?: string | null;
  customerBaseUrl?: string | null;
  googleReviewUrl?: string | null;
  websiteBaseUrl?: string | null;
  termsOfServiceUrl?: string | null;
  privacyPolicyUrl?: string | null;
};

export type MarketingMergeCustomer = {
  name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

export function renderMarketingMergeFields(params: {
  company: MarketingMergeCompany;
  customer?: MarketingMergeCustomer | null;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
}) {
  const ctx = buildNotificationContext({
    company: params.company,
    customer: {
      name: params.customer?.name?.trim() || "Customer",
      address: params.customer?.address,
      city: params.customer?.city,
      state: params.customer?.state,
      zip: params.customer?.zip,
    },
  });

  return {
    subject: renderTemplate(params.subject, ctx),
    bodyText: renderTemplate(params.bodyText, ctx),
    bodyHtml: params.bodyHtml ? renderTemplate(params.bodyHtml, ctx) : null,
  };
}
