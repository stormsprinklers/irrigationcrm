import { format, isThisYear, isToday } from "date-fns";

export function formatSmsMessageTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  if (isToday(date)) return format(date, "h:mm a");
  if (isThisYear(date)) return format(date, "MMM d, h:mm a");
  return format(date, "MMM d, yyyy h:mm a");
}
