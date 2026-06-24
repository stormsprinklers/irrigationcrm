import { format } from "date-fns";

export type CallerInfo = {
  phone: string;
  name?: string | null;
  customerId?: string | null;
  city?: string | null;
  mostRecentVisitAt?: string | null;
  doNotService?: boolean;
};

export function formatCallerVisitDate(iso: string | null | undefined) {
  if (!iso) return null;
  try {
    return format(new Date(iso), "MMM d, yyyy");
  } catch {
    return null;
  }
}

export function formatCallerIdSubtitle(info: CallerInfo | null | undefined) {
  if (!info?.customerId) return null;
  const parts: string[] = [];
  if (info.city) parts.push(info.city);
  const visit = formatCallerVisitDate(info.mostRecentVisitAt);
  if (visit) parts.push(`Last visit ${visit}`);
  return parts.length ? parts.join(" · ") : null;
}
