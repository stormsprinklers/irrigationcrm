import {
  addZonedDays,
  getZonedParts,
  getZonedWeekdayIndex,
  zonedWallTimeToUtc,
} from "@/lib/datetime/zoned";
import { resolveNotificationTimezone } from "@/lib/notifications/timezone";

/** Inclusive local start hour for automated customer messages (5:00 AM). */
export const AUTOMATED_SEND_WINDOW_START_HOUR = 5;
/**
 * Inclusive local start hour for marketing campaign email/SMS (8:00 AM).
 * Campaigns may not send from 9:00 PM through 7:59 AM company local time.
 */
export const CAMPAIGN_SEND_WINDOW_START_HOUR = 8;
/**
 * Exclusive local end hour for automated customer messages and campaigns (9:00 PM).
 * Sends are allowed while local hour is in [start, 21).
 */
export const AUTOMATED_SEND_WINDOW_END_HOUR = 21;
export const CAMPAIGN_SEND_WINDOW_END_HOUR = AUTOMATED_SEND_WINDOW_END_HOUR;

function isWithinSendWindow(
  at: Date,
  timeZone: string | null | undefined,
  startHour: number,
  endHour: number
): boolean {
  const tz = resolveNotificationTimezone(timeZone);
  const { hour } = getZonedParts(at, tz);
  return hour >= startHour && hour < endHour;
}

function nextSendWindowStart(
  at: Date,
  timeZone: string | null | undefined,
  startHour: number,
  endHour: number
): Date {
  const tz = resolveNotificationTimezone(timeZone);
  if (isWithinSendWindow(at, tz, startHour, endHour)) return at;

  const parts = getZonedParts(at, tz);

  if (parts.hour < startHour) {
    return zonedWallTimeToUtc(tz, parts.year, parts.month, parts.day, startHour, 0, 0);
  }

  const tomorrow = addZonedDays(at, 1, tz);
  const tomorrowParts = getZonedParts(tomorrow, tz);
  return zonedWallTimeToUtc(
    tz,
    tomorrowParts.year,
    tomorrowParts.month,
    tomorrowParts.day,
    startHour,
    0,
    0
  );
}

/**
 * True when `at` falls inside the automated send window in `timeZone`
 * (5:00 AM inclusive through 9:00 PM exclusive).
 */
export function isWithinAutomatedSendWindow(
  at: Date = new Date(),
  timeZone?: string | null
): boolean {
  return isWithinSendWindow(
    at,
    timeZone,
    AUTOMATED_SEND_WINDOW_START_HOUR,
    AUTOMATED_SEND_WINDOW_END_HOUR
  );
}

/**
 * True when `at` falls inside the campaign send window in `timeZone`
 * (8:00 AM inclusive through 9:00 PM exclusive).
 */
export function isWithinCampaignSendWindow(
  at: Date = new Date(),
  timeZone?: string | null
): boolean {
  return isWithinSendWindow(
    at,
    timeZone,
    CAMPAIGN_SEND_WINDOW_START_HOUR,
    CAMPAIGN_SEND_WINDOW_END_HOUR
  );
}

/**
 * Initial campaign outreach runs during normal campaign hours Monday through Saturday.
 * Sunday remains available for follow-ups and replies in conversations already underway.
 */
export function isWithinCampaignInitialOutreachWindow(
  at: Date = new Date(),
  timeZone?: string | null
): boolean {
  const tz = resolveNotificationTimezone(timeZone);
  return isWithinCampaignSendWindow(at, tz) && getZonedWeekdayIndex(at, tz) !== 0;
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
  return nextSendWindowStart(
    at,
    timeZone,
    AUTOMATED_SEND_WINDOW_START_HOUR,
    AUTOMATED_SEND_WINDOW_END_HOUR
  );
}

/** Next 8:00 AM local after campaign quiet hours (9:00 PM–8:00 AM). */
export function nextCampaignSendWindowStart(
  at: Date = new Date(),
  timeZone?: string | null
): Date {
  return nextSendWindowStart(
    at,
    timeZone,
    CAMPAIGN_SEND_WINDOW_START_HOUR,
    CAMPAIGN_SEND_WINDOW_END_HOUR
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

/**
 * Keep `when` if it is inside the campaign window; otherwise hold until the next 8:00 AM.
 * Campaign messages are never dropped — only deferred.
 */
export function clampToCampaignSendWindow(
  when: Date,
  timeZone?: string | null
): Date {
  if (isWithinCampaignSendWindow(when, timeZone)) return when;
  return nextCampaignSendWindowStart(when, timeZone);
}

/** Hold initial campaign outreach until Monday at 8:00 AM when it lands on Sunday. */
export function clampToCampaignInitialOutreachWindow(
  when: Date,
  timeZone?: string | null
): Date {
  const tz = resolveNotificationTimezone(timeZone);
  const candidate = clampToCampaignSendWindow(when, tz);
  if (getZonedWeekdayIndex(candidate, tz) !== 0) return candidate;

  const monday = addZonedDays(candidate, 1, tz);
  const parts = getZonedParts(monday, tz);
  return zonedWallTimeToUtc(
    tz,
    parts.year,
    parts.month,
    parts.day,
    CAMPAIGN_SEND_WINDOW_START_HOUR,
    0,
    0
  );
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
