import { CAMPAIGN_SEND_WINDOW_START_HOUR } from "@/lib/communications/send-window";
import {
  addZonedCalendarDays,
  getZonedParts,
  resolveCompanyTimezone,
  zonedWallTimeToUtc,
} from "@/lib/datetime/zoned";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const UTC_MIDNIGHT = /^(\d{4})-(\d{2})-(\d{2})T00:00:00(?:\.0+)?Z$/;
const WALL_DATETIME =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * Interpret a campaign date/time in the company timezone.
 *
 * - `YYYY-MM-DD` (and legacy UTC-midnight ISO) → 8:00 AM that local morning
 * - `YYYY-MM-DDTHH:mm` without a zone → that wall clock in company TZ
 * - Full ISO with `Z` / offset → absolute instant
 */
export function parseCampaignInstant(
  value: string | Date | null | undefined,
  timeZone?: string | null
): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const raw = value.trim();
  if (!raw) return null;
  const tz = resolveCompanyTimezone(timeZone);

  const dateOnly = raw.match(DATE_ONLY) ?? raw.match(UTC_MIDNIGHT);
  if (dateOnly) {
    return zonedWallTimeToUtc(
      tz,
      Number(dateOnly[1]),
      Number(dateOnly[2]),
      Number(dateOnly[3]),
      CAMPAIGN_SEND_WINDOW_START_HOUR,
      0,
      0
    );
  }

  const hasExplicitZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw);
  const wall = raw.match(WALL_DATETIME);
  if (wall && !hasExplicitZone) {
    return zonedWallTimeToUtc(
      tz,
      Number(wall[1]),
      Number(wall[2]),
      Number(wall[3]),
      Number(wall[4]),
      Number(wall[5]),
      Number(wall[6] ?? 0)
    );
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function campaignStartDateInputValue(
  startAt: string | undefined,
  timeZone?: string | null
): string {
  if (startAt == null || startAt === "") return "";
  const raw = String(startAt);
  if (DATE_ONLY.test(raw)) return raw;
  const instant = parseCampaignInstant(raw, timeZone);
  if (!instant) return raw.slice(0, 10);
  const parts = getZonedParts(instant, resolveCompanyTimezone(timeZone));
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function campaignDatetimeLocalValue(
  value: unknown,
  timeZone?: string | null
): string {
  if (!value) return "";
  const raw = String(value);
  const hasExplicitZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw);
  if (!hasExplicitZone && WALL_DATETIME.test(raw)) return raw.slice(0, 16);
  const instant = parseCampaignInstant(raw, timeZone);
  if (!instant) return "";
  const parts = getZonedParts(instant, resolveCompanyTimezone(timeZone));
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

/** First-send time for a campaign: trigger sendAt, else drip startAt, else now. */
export function resolveCampaignStartAt(params: {
  triggerConfig?: Record<string, unknown> | null;
  dripSettings?: { startAt?: string } | null;
  timeZone?: string | null;
  now?: Date;
}): { intendedStart: Date; isScheduled: boolean; raw: string | null } {
  const trigger =
    params.triggerConfig && typeof params.triggerConfig === "object" ? params.triggerConfig : {};
  const raw = String(trigger.sendAt ?? params.dripSettings?.startAt ?? "").trim() || null;
  const parsed = raw ? parseCampaignInstant(raw, params.timeZone) : null;
  const now = params.now ?? new Date();
  if (parsed && parsed.getTime() > now.getTime()) {
    return { intendedStart: parsed, isScheduled: true, raw };
  }
  return { intendedStart: now, isScheduled: false, raw };
}

export function addCampaignWaitDays(
  from: Date,
  days: number,
  timeZone?: string | null
): Date {
  return addZonedCalendarDays(from, days, resolveCompanyTimezone(timeZone), {
    keepTime: true,
  });
}
