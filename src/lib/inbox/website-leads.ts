export const WEBSITE_LEAD_THREAD_PREFIX = "website-lead:";
export const WEBSITE_FORM_SMS_PREFIX = "[Website form —";

export function leadIdFromThreadId(threadId: string | null | undefined) {
  if (!threadId?.startsWith(WEBSITE_LEAD_THREAD_PREFIX)) return null;
  return threadId.slice(WEBSITE_LEAD_THREAD_PREFIX.length) || null;
}

export function parseWebsiteFormSource(subject: string) {
  const match = subject.match(/^Website form:\s*(.+?)\s*—/);
  return match?.[1]?.trim() ?? null;
}

export function parseWebsiteFormName(subject: string) {
  const match = subject.match(/—\s*(.+)$/);
  return match?.[1]?.trim() ?? null;
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
