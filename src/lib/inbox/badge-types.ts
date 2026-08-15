export type InboxBadgeCounts = {
  sms: number;
  social: number;
  leads: number;
  missedCalls: number;
  total: number;
};

export function inboxCountForHref(href: string, counts: InboxBadgeCounts): number {
  if (href.startsWith("/inbox/voice")) return counts.missedCalls;
  if (href.startsWith("/inbox/sms")) return counts.sms;
  if (href.startsWith("/inbox/leads")) return counts.leads;
  if (href.startsWith("/inbox/social")) return counts.social;
  if (href === "/inbox") return counts.total;
  return 0;
}
