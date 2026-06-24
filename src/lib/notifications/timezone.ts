export const DEFAULT_NOTIFICATION_TIMEZONE = "America/Denver";

export function resolveNotificationTimezone(timezone?: string | null): string {
  const trimmed = timezone?.trim();
  if (!trimmed) return DEFAULT_NOTIFICATION_TIMEZONE;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmed });
    return trimmed;
  } catch {
    return DEFAULT_NOTIFICATION_TIMEZONE;
  }
}

export function formatTimeInTimezone(date: Date, timezone?: string | null): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: resolveNotificationTimezone(timezone),
  });
}
