export type TemplateContext = Record<string, string | number | null | undefined>;

export const NOTIFICATION_EVENTS = [
  "VISIT_SCHEDULED",
  "VISIT_TIME_UPDATED",
  "VISIT_CANCELLED",
  "VISIT_COMPLETED",
  "VISIT_EN_ROUTE",
  "REVIEW_REQUEST",
  "INVOICE_SENT",
  "INVOICE_REMINDER",
  "INVOICE_PAID_RECEIPT",
  "INVOICE_PAYMENT_FAILED",
  "ESTIMATE_SENT",
  "ESTIMATE_FOLLOW_UP",
  "FEEDBACK_SURVEY",
  "LEAD_ACKNOWLEDGED",
] as const;

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export const MERGE_FIELD_FOLDER_THRESHOLD = 20;

export const MERGE_FIELDS = [
  { token: "{customer_first_name}", label: "Customer first name", group: "Contact info" },
  { token: "{customer_last_name}", label: "Customer last name", group: "Contact info" },
  { token: "{customer_address}", label: "Customer address", group: "Contact info" },
  { token: "{company_name}", label: "Company name", group: "Company" },
  { token: "{company_phone}", label: "Company phone", group: "Company" },
  { token: "{terms_of_service_url}", label: "Terms of service URL", group: "Company" },
  { token: "{privacy_policy_url}", label: "Privacy policy URL", group: "Company" },
  { token: "{visit_date}", label: "Visit date", group: "Visit" },
  { token: "{visit_arrival_window}", label: "Arrival window", group: "Visit" },
  { token: "{visit_title}", label: "Visit title", group: "Visit" },
  { token: "{technician_first_name}", label: "Technician first name", group: "Visit" },
  { token: "{technician_eta}", label: "Technician ETA", group: "Visit" },
  { token: "{work_summary}", label: "Work summary", group: "Visit" },
  { token: "{invoice_amount}", label: "Invoice amount", group: "Invoices & estimates" },
  { token: "{invoice_number}", label: "Invoice number", group: "Invoices & estimates" },
  { token: "{invoice_link}", label: "Invoice link", group: "Invoices & estimates" },
  { token: "{estimate_amount}", label: "Estimate amount", group: "Invoices & estimates" },
  { token: "{estimate_link}", label: "Estimate link", group: "Invoices & estimates" },
  { token: "{estimate_range}", label: "Estimate range", group: "Invoices & estimates" },
  { token: "{review_link}", label: "Review link", group: "Links" },
  { token: "{portal_link}", label: "Portal link", group: "Links" },
  { token: "{track_link}", label: "Live track link", group: "Links" },
  { token: "{about_technician_link}", label: "About technician link", group: "Links" },
  { token: "{survey_link}", label: "Survey link", group: "Links" },
  { token: "{booking_link}", label: "Booking link", group: "Links" },
  { token: "{meeting_link}", label: "Google Meet link", group: "Links" },
] as const;

export const MERGE_FIELD_HINTS = MERGE_FIELDS.map((field) => field.token);

export type MergeFieldItem = {
  token: string;
  label: string;
  group: string;
};

export type MergeFieldFolder = {
  label: string;
  items: Array<{ token: string; label: string }>;
};

export function organizeMergeFields(
  fields: readonly MergeFieldItem[] = MERGE_FIELDS,
  threshold = MERGE_FIELD_FOLDER_THRESHOLD
):
  | { mode: "flat"; items: readonly MergeFieldItem[] }
  | { mode: "folders"; folders: MergeFieldFolder[] } {
  if (fields.length <= threshold) {
    return { mode: "flat", items: fields };
  }
  const order: string[] = [];
  const map = new Map<string, Array<{ token: string; label: string }>>();
  for (const field of fields) {
    if (!map.has(field.group)) {
      map.set(field.group, []);
      order.push(field.group);
    }
    map.get(field.group)!.push({ token: field.token, label: field.label });
  }
  return {
    mode: "folders",
    folders: order.map((label) => ({ label, items: map.get(label)! })),
  };
}

export function insertTokenAt(value: string, token: string, start: number, end = start) {
  const s = Math.max(0, Math.min(start, value.length));
  const e = Math.max(s, Math.min(end, value.length));
  return {
    next: `${value.slice(0, s)}${token}${value.slice(e)}`,
    caret: s + token.length,
  };
}

export const EVENT_LABELS: Record<NotificationEvent, string> = {
  VISIT_SCHEDULED: "Visit scheduled",
  VISIT_TIME_UPDATED: "Visit time updated",
  VISIT_CANCELLED: "Visit cancelled",
  VISIT_COMPLETED: "Visit completed",
  VISIT_EN_ROUTE: "Technician on the way",
  REVIEW_REQUEST: "Review request",
  INVOICE_SENT: "Invoice sent",
  INVOICE_REMINDER: "Invoice reminder",
  INVOICE_PAID_RECEIPT: "Invoice paid receipt",
  INVOICE_PAYMENT_FAILED: "Invoice payment failed",
  ESTIMATE_SENT: "Estimate sent",
  ESTIMATE_FOLLOW_UP: "Estimate follow-up",
  FEEDBACK_SURVEY: "Feedback survey",
  LEAD_ACKNOWLEDGED: "Website lead acknowledged",
};

export const DEFAULT_TEMPLATES: Array<{
  slug: string;
  name: string;
  channel: "SMS" | "EMAIL";
  subject?: string;
  body: string;
  event: NotificationEvent;
}> = [
  {
    slug: "visit_scheduled",
    name: "Visit scheduled",
    channel: "SMS",
    event: "VISIT_SCHEDULED",
    body: "Hi {customer_first_name}, your appointment with {company_name} is set for {visit_date}, arrival window {visit_arrival_window}.{meeting_link} Portal: {portal_link}",
  },
  {
    slug: "visit_scheduled",
    name: "Visit scheduled",
    channel: "EMAIL",
    event: "VISIT_SCHEDULED",
    subject: "Your appointment with {company_name}",
    body: "Hi {customer_first_name},\n\nYour {visit_title} is scheduled for {visit_date}.\nArrival window: {visit_arrival_window}\n{meeting_link}\nAddress: {customer_address}\n\nPortal: {portal_link}\n\n— {company_name}",
  },
  {
    slug: "visit_time_updated",
    name: "Visit time updated",
    channel: "SMS",
    event: "VISIT_TIME_UPDATED",
    body: "Hi {customer_first_name}, your appointment with {company_name} has been moved to {visit_date}, arrival window {visit_arrival_window}.",
  },
  {
    slug: "visit_time_updated",
    name: "Visit time updated",
    channel: "EMAIL",
    event: "VISIT_TIME_UPDATED",
    subject: "Appointment time updated — {company_name}",
    body: "Hi {customer_first_name},\n\nYour appointment time has changed to {visit_date}.\nArrival window: {visit_arrival_window}\n\nAddress: {customer_address}\n\n— {company_name}",
  },
  {
    slug: "visit_cancelled",
    name: "Visit cancelled",
    channel: "SMS",
    event: "VISIT_CANCELLED",
    body: "Hi {customer_first_name}, your appointment with {company_name} on {visit_date} has been cancelled. Call us to reschedule.",
  },
  {
    slug: "visit_cancelled",
    name: "Visit cancelled",
    channel: "EMAIL",
    event: "VISIT_CANCELLED",
    subject: "Appointment cancelled — {company_name}",
    body: "Hi {customer_first_name},\n\nYour appointment on {visit_date} has been cancelled.\n\nContact us to reschedule.\n\n— {company_name}",
  },
  {
    slug: "visit_completed",
    name: "Visit completed",
    channel: "SMS",
    event: "VISIT_COMPLETED",
    body: "Hi {customer_first_name}, thanks for choosing {company_name}! Your service visit is complete.",
  },
  {
    slug: "visit_en_route",
    name: "Technician on the way",
    channel: "SMS",
    event: "VISIT_EN_ROUTE",
    body: "Hi {customer_first_name}, {technician_first_name} is on the way. {technician_eta}. Track live: {track_link} — {company_name}",
  },
  {
    slug: "review_request",
    name: "Review request",
    channel: "SMS",
    event: "REVIEW_REQUEST",
    body: "Thanks {customer_first_name}! We'd love your feedback: {review_link} — {company_name}",
  },
  {
    slug: "review_request",
    name: "Review request",
    channel: "EMAIL",
    event: "REVIEW_REQUEST",
    subject: "How did we do? — {company_name}",
    body: "Hi {customer_first_name},\n\nThank you for choosing {company_name}. We'd appreciate a quick review:\n\n{review_link}\n\n— {company_name}",
  },
  {
    slug: "invoice_sent",
    name: "Invoice sent",
    channel: "SMS",
    event: "INVOICE_SENT",
    body: "Invoice {invoice_number} for {invoice_amount} from {company_name}. Pay: {invoice_link}",
  },
  {
    slug: "invoice_reminder",
    name: "Invoice reminder",
    channel: "SMS",
    event: "INVOICE_REMINDER",
    body: "Reminder: Invoice {invoice_number} for {invoice_amount} is due. Pay: {invoice_link}",
  },
  {
    slug: "invoice_paid_receipt",
    name: "Invoice paid receipt",
    channel: "EMAIL",
    event: "INVOICE_PAID_RECEIPT",
    subject: "Payment receipt — {company_name}",
    body: "Hi {customer_first_name},\n\nThank you for your payment of {invoice_amount}.\n\nView invoice: {invoice_link}\n\nTerms of Service: {terms_of_service_url}\nPrivacy Policy: {privacy_policy_url}\n\n— {company_name}",
  },
  {
    slug: "invoice_paid_receipt",
    name: "Invoice paid receipt",
    channel: "SMS",
    event: "INVOICE_PAID_RECEIPT",
    body: "Payment received ({invoice_amount}). View invoice: {invoice_link} — {company_name}",
  },
  {
    slug: "invoice_payment_failed",
    name: "Invoice payment failed",
    channel: "EMAIL",
    event: "INVOICE_PAYMENT_FAILED",
    subject: "Payment unsuccessful — {company_name}",
    body: "Hi {customer_first_name},\n\nWe weren't able to process your payment of {invoice_amount} for invoice {invoice_number}.\n\nPlease try again here:\n{invoice_link}\n\n— {company_name}",
  },
  {
    slug: "invoice_payment_failed",
    name: "Invoice payment failed",
    channel: "SMS",
    event: "INVOICE_PAYMENT_FAILED",
    body: "Payment of {invoice_amount} didn't go through. Try again: {invoice_link} — {company_name}",
  },
  {
    slug: "estimate_sent",
    name: "Estimate sent",
    channel: "EMAIL",
    event: "ESTIMATE_SENT",
    subject: "Estimate from {company_name}",
    body: "Hi {customer_first_name},\n\nYour estimate is ready: {estimate_link}\n\n— {company_name}",
  },
  {
    slug: "estimate_sent",
    name: "Estimate sent",
    channel: "SMS",
    event: "ESTIMATE_SENT",
    body: "Your estimate from {company_name} is ready: {estimate_link}",
  },
  {
    slug: "estimate_follow_up",
    name: "Estimate follow-up",
    channel: "SMS",
    event: "ESTIMATE_FOLLOW_UP",
    body: "Hi {customer_first_name}, following up on your {estimate_amount} estimate from {company_name}. View it here: {estimate_link}",
  },
  {
    slug: "estimate_follow_up",
    name: "Estimate follow-up",
    channel: "EMAIL",
    event: "ESTIMATE_FOLLOW_UP",
    subject: "Following up on your estimate — {company_name}",
    body: "Hi {customer_first_name},\n\nWe wanted to follow up on the estimate we sent ({estimate_amount}).\n\nView and approve here:\n{estimate_link}\n\nLet us know if you have any questions.\n\n— {company_name}",
  },
  {
    slug: "feedback_survey",
    name: "Feedback survey",
    channel: "SMS",
    event: "FEEDBACK_SURVEY",
    body: "Hi {customer_first_name}, how was your service with {company_name}? Share feedback: {survey_link}",
  },
  {
    slug: "feedback_survey",
    name: "Feedback survey",
    channel: "EMAIL",
    event: "FEEDBACK_SURVEY",
    subject: "How was your visit? — {company_name}",
    body: "Hi {customer_first_name},\n\nWe'd love to hear about your recent visit:\n\n{survey_link}\n\n— {company_name}",
  },
  {
    slug: "lead_acknowledged",
    name: "Website lead acknowledged",
    channel: "SMS",
    event: "LEAD_ACKNOWLEDGED",
    body: "Hi {customer_first_name}, we got your request! {company_name} will follow up soon. Ballpark: {estimate_range} Book: {booking_link}",
  },
  {
    slug: "lead_acknowledged",
    name: "Website lead acknowledged",
    channel: "EMAIL",
    event: "LEAD_ACKNOWLEDGED",
    subject: "We received your request — {company_name}",
    body: "Hi {customer_first_name},\n\nThanks for reaching out to {company_name}. Our team is reviewing your details and will follow up shortly.\n\n{estimate_range}\n\nBook a time with us:\n{booking_link}\n\nOr call/text {company_phone}.\n\n— {company_name}",
  },
];

/** Supports {snake_case} and legacy {{camelCase}} merge fields. */
export function renderTemplate(template: string, context: TemplateContext): string {
  let result = template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = context[key];
    if (value === null || value === undefined) return "";
    return String(value);
  });
  result = result.replace(/\{([a-z_]+)\}/g, (_, key: string) => {
    const value = context[key];
    if (value === null || value === undefined) return "";
    return String(value);
  });
  return result;
}

// Re-export for backward compatibility
export { buildVisitContext, buildEnRouteContext } from "./context";
