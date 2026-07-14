/** Human-readable website form names for inbox notifications and subjects. */

const FORM_LABELS: Record<string, string> = {
  contact: "Contact Form",
  "commercial-bid": "Commercial Bid Request",
  "maintenance-signup": "Service Plan Interest Form",
  "pricing-quote": "Unbooked Estimate",
  "unbooked-estimate": "Unbooked Estimate",
  careers: "New Job Applicant",
};

export function websiteLeadFormLabel(source: string | null | undefined): string {
  const key = (source ?? "contact").trim().toLowerCase();
  if (FORM_LABELS[key]) return FORM_LABELS[key];

  const titled = key
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return titled ? `${titled} Form` : "Contact Form";
}

export function websiteLeadNotificationTitle(
  source: string | null | undefined,
  name: string
): string {
  return `${websiteLeadFormLabel(source)}: ${name}`;
}

/** Map a display label back to a source slug when possible. */
export function websiteLeadSourceFromLabel(label: string | null | undefined): string | null {
  if (!label?.trim()) return null;
  const normalized = label.trim().toLowerCase();
  for (const [slug, formLabel] of Object.entries(FORM_LABELS)) {
    if (formLabel.toLowerCase() === normalized) return slug;
  }
  return label.trim();
}
