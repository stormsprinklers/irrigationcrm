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

export function startOfZonedDay(date: Date, timeZone?: string | null): Date {
  const tz = resolveNotificationTimezone(timeZone);
  const parts = getZonedParts(date, tz);
  return zonedWallTimeToUtc(tz, parts.year, parts.month, parts.day, 0, 0, 0);
}

/** Add whole calendar days in the given timezone (DST-safe). */
export function addZonedDays(date: Date, days: number, timeZone?: string | null): Date {
  return addZonedCalendarDays(date, days, timeZone, { keepTime: false });
}

/**
 * Add whole calendar days in `timeZone`, keeping the local hour/minute/second.
 * DST-safe (e.g. 1 day from 9:00 AM stays 9:00 AM the next local day).
 */
export function addZonedCalendarDays(
  date: Date,
  days: number,
  timeZone?: string | null,
  options: { keepTime?: boolean } = {}
): Date {
  const tz = resolveNotificationTimezone(timeZone);
  const parts = getZonedParts(date, tz);
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  const keepTime = options.keepTime !== false;
  return zonedWallTimeToUtc(
    tz,
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
    keepTime ? parts.hour : 0,
    keepTime ? parts.minute : 0,
    keepTime ? parts.second : 0
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

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

/** Format an instant for a date input using the company's wall clock, not the browser's timezone. */
export function zonedDateInputValue(
  value: Date | string,
  timeZone?: string | null
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = getZonedParts(date, resolveNotificationTimezone(timeZone));
  return `${parts.year}-${padDatePart(parts.month)}-${padDatePart(parts.day)}`;
}

/** Format an instant for a datetime-local input using the company's wall clock. */
export function zonedDateTimeInputValue(
  value: Date | string,
  timeZone?: string | null
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = getZonedParts(date, resolveNotificationTimezone(timeZone));
  return `${parts.year}-${padDatePart(parts.month)}-${padDatePart(parts.day)}T${padDatePart(parts.hour)}:${padDatePart(parts.minute)}`;
}

/** Parse a date/datetime-local value as company-local wall time and return the UTC instant. */
export function zonedWallTimeInputToUtc(
  value: string,
  timeZone?: string | null
): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
  if (!match) return new Date(Number.NaN);

  const requested = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4] ?? 0),
    minute: Number(match[5] ?? 0),
    second: Number(match[6] ?? 0),
  };
  const tz = resolveNotificationTimezone(timeZone);
  const result = zonedWallTimeToUtc(
    tz,
    requested.year,
    requested.month,
    requested.day,
    requested.hour,
    requested.minute,
    requested.second
  );
  const roundTrip = getZonedParts(result, tz);
  if (
    roundTrip.year !== requested.year ||
    roundTrip.month !== requested.month ||
    roundTrip.day !== requested.day ||
    roundTrip.hour !== requested.hour ||
    roundTrip.minute !== requested.minute ||
    roundTrip.second !== requested.second
  ) {
    return new Date(Number.NaN);
  }
  return result;
}

/** Reinterpret a browser-local display Date as company-local wall time. */
export function localWallDateToUtc(value: Date, timeZone?: string | null): Date {
  return zonedWallTimeToUtc(
    resolveNotificationTimezone(timeZone),
    value.getFullYear(),
    value.getMonth() + 1,
    value.getDate(),
    value.getHours(),
    value.getMinutes(),
    value.getSeconds()
  );
}

/** Convert an instant to a Date whose browser-local fields equal the company's wall clock fields. */
export function instantToLocalWallDate(
  value: Date | string,
  timeZone?: string | null
): Date {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = getZonedParts(date, resolveNotificationTimezone(timeZone));
  return new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    0
  );
}
