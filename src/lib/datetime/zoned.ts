import { DEFAULT_NOTIFICATION_TIMEZONE, resolveNotificationTimezone } from "@/lib/notifications/timezone";

export { DEFAULT_NOTIFICATION_TIMEZONE as DEFAULT_COMPANY_TIMEZONE };
export { resolveNotificationTimezone as resolveCompanyTimezone };

const DAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
};

/** Read calendar/clock fields of an instant in an IANA timezone. */
export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const tz = resolveNotificationTimezone(timeZone);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const map: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour === "24" ? "0" : map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: map.weekday ?? "",
  };
}

/**
 * Convert a wall-clock date/time in `timeZone` to a UTC Date.
 * Handles DST via iterative adjustment against Intl.
 */
export function zonedWallTimeToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second = 0
): Date {
  const tz = resolveNotificationTimezone(timeZone);
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, second);

  for (let i = 0; i < 4; i++) {
    const got = getZonedParts(new Date(utcMs), tz);
    const gotAsUtc = Date.UTC(got.year, got.month - 1, got.day, got.hour, got.minute, got.second);
    const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
    const delta = desiredAsUtc - gotAsUtc;
    if (delta === 0) break;
    utcMs += delta;
  }

  return new Date(utcMs);
}

export function startOfZonedDay(date: Date, timeZone: string): Date {
  const parts = getZonedParts(date, timeZone);
  return zonedWallTimeToUtc(timeZone, parts.year, parts.month, parts.day, 0, 0, 0);
}

/** Add whole calendar days in the given timezone (DST-safe). */
export function addZonedDays(date: Date, days: number, timeZone: string): Date {
  const parts = getZonedParts(date, timeZone);
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return zonedWallTimeToUtc(
    timeZone,
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
    0,
    0,
    0
  );
}

/** 0 = Sunday … 6 = Saturday in the given timezone. */
export function getZonedWeekdayIndex(date: Date, timeZone: string): number {
  const { weekday } = getZonedParts(date, timeZone);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? 0;
}

export function getZonedDayKey(date: Date, timeZone: string): (typeof DAY_KEYS)[number] {
  return DAY_KEYS[getZonedWeekdayIndex(date, timeZone)];
}

export function formatInTimezone(
  date: Date | string,
  timeZone: string | null | undefined,
  options: Intl.DateTimeFormatOptions
): string {
  const value = typeof date === "string" ? new Date(date) : date;
  return value.toLocaleString("en-US", {
    ...options,
    timeZone: resolveNotificationTimezone(timeZone),
  });
}
