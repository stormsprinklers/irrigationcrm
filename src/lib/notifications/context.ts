import { getInvoicePayUrl } from "@/lib/invoices/pay-url";
import { customerPortalHomeUrl, customerEstimateUrl } from "@/lib/company/customer-url";
import { formatArrivalWindow, formatVisitDate } from "./arrival-window";
import { firstNameFromName, splitCustomerName } from "./name-utils";
import type { TemplateContext } from "./templates";
import { formatTimeInTimezone } from "./timezone";

export const EN_ROUTE_ETA_FALLBACK = "They'll be there soon";

type CompanySlice = {
  name: string;
  timezone?: string | null;
  portalSlug?: string | null;
  bookingSlug?: string | null;
  customerBaseUrl?: string | null;
  googleReviewUrl?: string | null;
  websiteBaseUrl?: string | null;
  arrivalWindowHours?: number | null;
  termsOfServiceUrl?: string | null;
  privacyPolicyUrl?: string | null;
};

type CustomerSlice = {
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

type VisitSlice = {
  title: string;
  startAt: Date;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  meetingUrl?: string | null;
};

type TechnicianSlice = {
  name: string;
  websiteTeamSlug?: string | null;
};

type InvoiceSlice = {
  invoiceNumber: string;
  amount: number;
  publicToken: string;
};

type EstimateSlice = {
  publicToken: string;
  estimateNumber?: string | null;
};

type AddressSlice = {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

export function formatCustomerAddress(parts: AddressSlice | null | undefined): string {
  if (!parts) return "";
  const cityStateZip = [parts.city, [parts.state, parts.zip].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return [parts.address, cityStateZip].filter(Boolean).join(", ");
}

function resolveCustomerAddress(params: {
  visit?: AddressSlice | null;
  property?: AddressSlice | null;
  customer?: AddressSlice | null;
}) {
  for (const source of [params.visit, params.property, params.customer]) {
    const formatted = formatCustomerAddress(source);
    if (formatted) return formatted;
  }
  return "";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function buildNotificationContext(params: {
  company: CompanySlice;
  customer?: CustomerSlice | null;
  visit?: VisitSlice | null;
  technician?: TechnicianSlice | null;
  invoice?: InvoiceSlice | null;
  estimate?: EstimateSlice | null;
  property?: AddressSlice | null;
  etaSeconds?: number | null;
  etaAt?: Date | null;
  surveyUrl?: string | null;
  portalUrl?: string | null;
  estimateUrl?: string | null;
  trackUrl?: string | null;
}): TemplateContext {
  const websiteBase =
    params.company.websiteBaseUrl?.replace(/\/$/, "") ??
    process.env.NEXT_PUBLIC_WEBSITE_URL?.replace(/\/$/, "") ??
    "";

  const customerName = params.customer?.name ?? "Customer";
  const { firstName, lastName } = splitCustomerName(customerName);

  const visitAddress = resolveCustomerAddress({
    visit: params.visit,
    property: params.property,
    customer: params.customer,
  });

  const arrivalHours = params.company.arrivalWindowHours ?? 3;
  const startAt = params.visit?.startAt;
  const timezone = params.company.timezone;

  const portalHome = customerPortalHomeUrl(params.company);

  const technicianFirst = params.technician ? firstNameFromName(params.technician.name) : "";
  const aboutTechnician =
    params.technician?.websiteTeamSlug && websiteBase
      ? `${websiteBase}/team/${params.technician.websiteTeamSlug}`
      : "";

  const invoiceLink = params.invoice
    ? getInvoicePayUrl(params.invoice.publicToken, params.company)
    : "";
  const estimateLink =
    params.estimateUrl ??
    (params.estimate
      ? customerEstimateUrl(params.company, params.estimate.publicToken)
      : "");

  const etaMinutes =
    params.etaSeconds != null ? String(Math.max(1, Math.round(params.etaSeconds / 60))) : "";
  const etaTime = params.etaAt ? formatTimeInTimezone(params.etaAt, timezone) : "";
  const technicianEta =
    etaTime && etaMinutes
      ? `${etaTime} (about ${etaMinutes} min)`
      : etaTime || EN_ROUTE_ETA_FALLBACK;

  const ctx: TemplateContext = {
    // snake_case (primary)
    customer_first_name: firstName,
    customer_last_name: lastName,
    customer_address: visitAddress,
    technician_first_name: technicianFirst,
    company_name: params.company.name,
    terms_of_service_url: params.company.termsOfServiceUrl?.trim() ?? "",
    privacy_policy_url: params.company.privacyPolicyUrl?.trim() ?? "",
    visit_date: startAt ? formatVisitDate(startAt, timezone) : "",
    visit_arrival_window: startAt
      ? params.visit?.meetingUrl
        ? formatTimeInTimezone(startAt, timezone)
        : formatArrivalWindow(startAt, arrivalHours, timezone)
      : "",
    meeting_link: params.visit?.meetingUrl
      ? `\nGoogle Meet: ${params.visit.meetingUrl}\n`
      : "",
    invoice_amount: params.invoice ? formatCurrency(params.invoice.amount) : "",
    review_link: params.company.googleReviewUrl ?? "",
    technician_eta: technicianEta,
    portal_link: params.portalUrl ?? portalHome,
    track_link: params.trackUrl ?? "",
    invoice_link: invoiceLink,
    about_technician_link: aboutTechnician,
    estimate_link: estimateLink,
    survey_link: params.surveyUrl ?? "",
    // legacy camelCase
    customerName,
    companyName: params.company.name,
    visitTitle: params.visit?.title ?? "",
    visit_title: params.visit?.title ?? "",
    visitDate: startAt ? formatVisitDate(startAt, timezone) : "",
    visitTime: startAt ? formatTimeInTimezone(startAt, timezone) : "",
    visitAddress,
    technicianName: params.technician?.name ?? "",
    etaMinutes,
    etaTime,
    invoiceNumber: params.invoice?.invoiceNumber ?? "",
    invoice_number: params.invoice?.invoiceNumber ?? "",
    payUrl: invoiceLink,
    estimateNumber: params.estimate?.estimateNumber ?? "",
  };

  return ctx;
}

export function buildVisitContext(params: {
  customerName: string;
  companyName: string;
  visitTitle: string;
  startAt: Date;
  address?: string | null;
  arrivalWindowHours?: number;
  timezone?: string | null;
}): TemplateContext {
  return buildNotificationContext({
    company: {
      name: params.companyName,
      arrivalWindowHours: params.arrivalWindowHours ?? 3,
      timezone: params.timezone,
    },
    customer: { name: params.customerName },
    visit: {
      title: params.visitTitle,
      startAt: params.startAt,
      address: params.address,
    },
  });
}

export function buildEnRouteContext(params: {
  customerName: string;
  companyName: string;
  technicianName: string;
  visitTitle: string;
  etaSeconds?: number | null;
  etaAt?: Date | null;
  visitAddress?: string | null;
  timezone?: string | null;
  trackUrl?: string | null;
}): TemplateContext {
  return buildNotificationContext({
    company: { name: params.companyName, timezone: params.timezone },
    customer: { name: params.customerName },
    visit: {
      title: params.visitTitle,
      startAt: params.etaAt ?? new Date(),
      address: params.visitAddress,
    },
    technician: { name: params.technicianName },
    etaSeconds: params.etaSeconds ?? null,
    etaAt: params.etaAt ?? null,
    trackUrl: params.trackUrl ?? null,
  });
}
