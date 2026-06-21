export type TemplateContext = Record<string, string | number | null | undefined>;

export const NOTIFICATION_EVENTS = [
  "VISIT_SCHEDULED",
  "INVOICE_SENT",
  "INVOICE_REMINDER",
  "ESTIMATE_SENT",
] as const;

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export const MERGE_FIELD_HINTS = [
  "{{customerName}}",
  "{{companyName}}",
  "{{visitTitle}}",
  "{{visitDate}}",
  "{{visitTime}}",
  "{{visitAddress}}",
  "{{invoiceNumber}}",
  "{{invoiceAmount}}",
  "{{payUrl}}",
  "{{estimateNumber}}",
];

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
    body: "Hi {{customerName}}, your {{visitTitle}} is scheduled for {{visitDate}} at {{visitTime}}. — {{companyName}}",
  },
  {
    slug: "visit_scheduled",
    name: "Visit scheduled",
    channel: "EMAIL",
    event: "VISIT_SCHEDULED",
    subject: "Your appointment with {{companyName}}",
    body: "Hi {{customerName}},\n\nYour {{visitTitle}} is scheduled for {{visitDate}} at {{visitTime}}.\n\nAddress: {{visitAddress}}\n\n— {{companyName}}",
  },
  {
    slug: "invoice_sent",
    name: "Invoice sent",
    channel: "SMS",
    event: "INVOICE_SENT",
    body: "Invoice {{invoiceNumber}} for {{invoiceAmount}} from {{companyName}}. Pay here: {{payUrl}}",
  },
  {
    slug: "estimate_sent",
    name: "Estimate sent",
    channel: "EMAIL",
    event: "ESTIMATE_SENT",
    subject: "Estimate from {{companyName}}",
    body: "Hi {{customerName}},\n\nYour estimate is ready from {{companyName}}.\n\n— {{companyName}}",
  },
];

export function renderTemplate(template: string, context: TemplateContext): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = context[key];
    if (value === null || value === undefined) return "";
    return String(value);
  });
}

export function buildVisitContext(params: {
  customerName: string;
  companyName: string;
  visitTitle: string;
  startAt: Date;
  address?: string | null;
}): TemplateContext {
  const start = params.startAt;
  return {
    customerName: params.customerName,
    companyName: params.companyName,
    visitTitle: params.visitTitle,
    visitDate: start.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    }),
    visitTime: start.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }),
    visitAddress: params.address ?? "",
  };
}
