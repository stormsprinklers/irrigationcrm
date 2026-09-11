import { buildNotificationContext } from "@/lib/notifications/context";
import { unwrapMergeTokenSpans } from "@/lib/notifications/merge-tokens";
import { renderTemplate } from "@/lib/notifications/templates";

export type MarketingMergeCompany = {
  name: string;
  phone?: string | null;
  timezone?: string | null;
  portalSlug?: string | null;
  bookingSlug?: string | null;
  websiteBookingUrl?: string | null;
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
  property?: MarketingMergeCustomer | null;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
}) {
  const name = params.customer?.name?.trim() || "";
  const ctx = buildNotificationContext({
    company: params.company,
    customer: {
      name,
      address: params.customer?.address,
      city: params.customer?.city,
      state: params.customer?.state,
      zip: params.customer?.zip,
    },
    property: params.property
      ? {
          address: params.property.address,
          city: params.property.city,
          state: params.property.state,
          zip: params.property.zip,
        }
      : undefined,
  });
  if (!name) {
    ctx.customer_first_name = "";
    ctx.customer_last_name = "";
    ctx.customerName = "";
  }

  const bodyHtml = params.bodyHtml ? unwrapMergeTokenSpans(params.bodyHtml) : null;
  return {
    subject: renderTemplate(params.subject, ctx),
    bodyText: renderTemplate(params.bodyText, ctx),
    bodyHtml: bodyHtml ? renderTemplate(bodyHtml, ctx) : null,
  };
}
