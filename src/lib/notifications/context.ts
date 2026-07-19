import { getInvoicePayUrl } from "@/lib/invoices/pay-url";
import { resolvePortalSlug } from "@/lib/portal/company";
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

function formatAddress(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(", ");
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
  etaSeconds?: number | null;
  etaAt?: Date | null;
  surveyUrl?: string | null;
  portalUrl?: string | null;
  estimateUrl?: string | null;
}): TemplateContext {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const websiteBase =
    params.company.websiteBaseUrl?.replace(/\/$/, "") ??
    process.env.NEXT_PUBLIC_WEBSITE_URL?.replace(/\/$/, "") ??
    "";

  const customerName = params.customer?.name ?? "Customer";
  const { firstName, lastName } = splitCustomerName(customerName);

  const visitAddress = params.visit
    ? formatAddress([params.visit.address, params.visit.city, params.visit.state, params.visit.zip])
    : params.customer
      ? formatAddress([params.customer.address, params.customer.city, params.customer.state, params.customer.zip])
      : "";

  const arrivalHours = params.company.arrivalWindowHours ?? 3;
  const startAt = params.visit?.startAt;
  const timezone = params.company.timezone;

  const portalSlug = resolvePortalSlug({
    portalSlug: params.company.portalSlug ?? null,
    bookingSlug: params.company.bookingSlug ?? null,
  });
  const portalHome = portalSlug ? `${appUrl}/portal/${portalSlug}` : appUrl;

  const technicianFirst = params.technician ? firstNameFromName(params.technician.name) : "";
  const aboutTechnician =
    params.technician?.websiteTeamSlug && websiteBase
      ? `${websiteBase}/team/${params.technician.websiteTeamSlug}`
      : "";

  const invoiceLink = params.invoice ? getInvoicePayUrl(params.invoice.publicToken) : "";
  const estimateLink =
    params.estimateUrl ??
    (params.estimate && portalSlug
      ? `${appUrl}/portal/${portalSlug}/estimates/${params.estimate.publicToken}`
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
    visit_arrival_window: startAt ? formatArrivalWindow(startAt, arrivalHours, timezone) : "",
    invoice_amount: params.invoice ? formatCurrency(params.invoice.amount) : "",
    review_link: params.company.googleReviewUrl ?? "",
    technician_eta: technicianEta,
    portal_link: params.portalUrl ?? portalHome,
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
  });
}
