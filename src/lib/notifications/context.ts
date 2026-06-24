import { getInvoicePayUrl } from "@/lib/invoices/pay-url";
import { resolvePortalSlug } from "@/lib/portal/company";
import { formatArrivalWindow, formatVisitDate } from "./arrival-window";
import { firstNameFromName, splitCustomerName } from "./name-utils";
import type { TemplateContext } from "./templates";

type CompanySlice = {
  name: string;
  portalSlug?: string | null;
  bookingSlug?: string | null;
  googleReviewUrl?: string | null;
  websiteBaseUrl?: string | null;
  arrivalWindowHours?: number | null;
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
  const etaTime =
    params.etaAt?.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) ?? "";

  const ctx: TemplateContext = {
    // snake_case (primary)
    customer_first_name: firstName,
    customer_last_name: lastName,
    customer_address: visitAddress,
    technician_first_name: technicianFirst,
    company_name: params.company.name,
    visit_date: startAt ? formatVisitDate(startAt) : "",
    visit_arrival_window: startAt ? formatArrivalWindow(startAt, arrivalHours) : "",
    invoice_amount: params.invoice ? formatCurrency(params.invoice.amount) : "",
    review_link: params.company.googleReviewUrl ?? "",
    technician_eta: etaTime && etaMinutes ? `${etaTime} (about ${etaMinutes} min)` : etaTime,
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
    visitDate: startAt ? formatVisitDate(startAt) : "",
    visitTime: startAt
      ? startAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : "",
    visitAddress,
    technicianName: params.technician?.name ?? "",
    etaMinutes,
    etaTime,
    invoiceNumber: params.invoice?.invoiceNumber ?? "",
    invoice_number: params.invoice?.invoiceNumber ?? "",
    payUrl: invoiceLink,
    estimateNumber: "",
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
}): TemplateContext {
  return buildNotificationContext({
    company: {
      name: params.companyName,
      arrivalWindowHours: params.arrivalWindowHours ?? 3,
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
  etaSeconds: number;
  etaAt: Date;
  visitAddress?: string | null;
}): TemplateContext {
  return buildNotificationContext({
    company: { name: params.companyName },
    customer: { name: params.customerName },
    visit: {
      title: params.visitTitle,
      startAt: params.etaAt,
      address: params.visitAddress,
    },
    technician: { name: params.technicianName },
    etaSeconds: params.etaSeconds,
    etaAt: params.etaAt,
  });
}
