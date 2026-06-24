import { resolveNotificationTimezone } from "./timezone";

export function formatArrivalWindow(
  startAt: Date,
  windowHours: number,
  timezone?: string | null
): string {
  const tz = resolveNotificationTimezone(timezone);
  const endAt = new Date(startAt.getTime() + windowHours * 60 * 60 * 1000);
  const timeFmt: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  };
  const start = startAt.toLocaleTimeString("en-US", timeFmt);
  const end = endAt.toLocaleTimeString("en-US", timeFmt);
  return `${start} – ${end}`;
}

export function formatVisitDate(startAt: Date, timezone?: string | null): string {
  return startAt.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: resolveNotificationTimezone(timezone),
  });
}
