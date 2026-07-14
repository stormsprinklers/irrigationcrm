export const WEBSITE_LEAD_THREAD_PREFIX = "website-lead:";
export const WEBSITE_FORM_SMS_PREFIX = "[Website form —";

export function leadIdFromThreadId(threadId: string | null | undefined) {
  if (!threadId?.startsWith(WEBSITE_LEAD_THREAD_PREFIX)) return null;
  return threadId.slice(WEBSITE_LEAD_THREAD_PREFIX.length) || null;
}

export function parseWebsiteFormSource(subject: string) {
  // Legacy: "Website form: contact — Name"
  const legacy = subject.match(/^Website form:\s*(.+?)\s*—/);
  if (legacy) return legacy[1]?.trim() ?? null;

  // Current: "Contact Form: Name" — map known labels back to source slugs when possible
  const current = subject.match(/^(.+?):\s*.+$/);
  const label = current?.[1]?.trim() ?? null;
  if (!label || label.toLowerCase() === "website form") return null;
  // Lazy import avoided — inline reverse of common labels
  const map: Record<string, string> = {
    "contact form": "contact",
    "commercial bid request": "commercial-bid",
    "service plan interest form": "maintenance-signup",
    "unbooked estimate": "pricing-quote",
    "new job applicant": "careers",
  };
  return map[label.toLowerCase()] ?? label;
}

export function parseWebsiteFormName(subject: string) {
  const legacy = subject.match(/—\s*(.+)$/);
  if (legacy) return legacy[1]?.trim() ?? null;
  const current = subject.match(/^[^:]+:\s*(.+)$/);
  return current?.[1]?.trim() ?? null;
}

/** Parse SMS website-form prefix: `[Website form — source]` or `[Website form — source | lead:id]`. */
export function parseWebsiteFormSmsPrefix(body: string) {
  const match = body.match(/^\[Website form — ([^\|\]]+?)(?:\s*\|\s*lead:([^\]]+))?\]/);
  if (!match) return { source: null as string | null, leadId: null as string | null };
  return {
    source: match[1]?.trim() || null,
    leadId: match[2]?.trim() || null,
  };
}
