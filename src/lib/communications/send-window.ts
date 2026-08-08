import {
  addZonedDays,
  getZonedParts,
  zonedWallTimeToUtc,
} from "@/lib/datetime/zoned";
import { resolveNotificationTimezone } from "@/lib/notifications/timezone";

/** Inclusive local start hour for automated customer messages (5:00 AM). */
export const AUTOMATED_SEND_WINDOW_START_HOUR = 5;
/**
 * Exclusive local end hour for automated customer messages (9:00 PM).
 * Sends are allowed while local hour is in [5, 21).
 */
export const AUTOMATED_SEND_WINDOW_END_HOUR = 21;

/**
 * True when `at` falls inside the automated send window in `timeZone`
 * (5:00 AM inclusive through 9:00 PM exclusive).
 */
export function isWithinAutomatedSendWindow(
  at: Date = new Date(),
  timeZone?: string | null
): boolean {
  const tz = resolveNotificationTimezone(timeZone);
  const { hour } = getZonedParts(at, tz);
  return hour >= AUTOMATED_SEND_WINDOW_START_HOUR && hour < AUTOMATED_SEND_WINDOW_END_HOUR;
}

/**
 * Earliest 5:00 AM local time that is still in the future relative to quiet hours.
 * - Before 5:00 AM → today at 5:00 AM
 * - From 9:00 PM onward → tomorrow at 5:00 AM
 * - During the allowed window → returns `at` unchanged (caller should prefer clamp)
 */
export function nextAutomatedSendWindowStart(
  at: Date = new Date(),
  timeZone?: string | null
): Date {
  const tz = resolveNotificationTimezone(timeZone);
  if (isWithinAutomatedSendWindow(at, tz)) return at;

  const parts = getZonedParts(at, tz);

  if (parts.hour < AUTOMATED_SEND_WINDOW_START_HOUR) {
    return zonedWallTimeToUtc(
      tz,
      parts.year,
      parts.month,
      parts.day,
      AUTOMATED_SEND_WINDOW_START_HOUR,
      0,
      0
    );
  }

  const tomorrow = addZonedDays(at, 1, tz);
  const tomorrowParts = getZonedParts(tomorrow, tz);
  return zonedWallTimeToUtc(
    tz,
    tomorrowParts.year,
    tomorrowParts.month,
    tomorrowParts.day,
    AUTOMATED_SEND_WINDOW_START_HOUR,
    0,
    0
  );
}

/**
 * Keep `when` if it is inside the send window; otherwise hold until the next 5:00 AM.
 * Messages are never dropped — only deferred.
 */
export function clampToAutomatedSendWindow(
  when: Date,
  timeZone?: string | null
): Date {
  if (isWithinAutomatedSendWindow(when, timeZone)) return when;
  return nextAutomatedSendWindowStart(when, timeZone);
}

/** Tomorrow (or today if still before) 8:00 AM local — used for daily rate-limit deferrals. */
export function nextLocalMorningAtHour(
  at: Date,
  hour: number,
  timeZone?: string | null
): Date {
  const tz = resolveNotificationTimezone(timeZone);
  const parts = getZonedParts(at, tz);
  if (parts.hour < hour) {
    return zonedWallTimeToUtc(tz, parts.year, parts.month, parts.day, hour, 0, 0);
  }
  const tomorrow = addZonedDays(at, 1, tz);
  const tomorrowParts = getZonedParts(tomorrow, tz);
  return zonedWallTimeToUtc(
    tz,
    tomorrowParts.year,
    tomorrowParts.month,
    tomorrowParts.day,
    hour,
    0,
    0
  );
}
