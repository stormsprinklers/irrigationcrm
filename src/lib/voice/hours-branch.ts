export type HoursBranchRule = {
  id: string;
  label: string;
  /** 0 = Sunday … 6 = Saturday */
  days: number[];
  /** "HH:MM" 24h local company time */
  start: string;
  end: string;
  nextNodeId: string;
};

export type HoursBranchConfig = {
  rules?: HoursBranchRule[];
  /** Used when no rule matches */
  defaultNextNodeId?: string;
};

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

function parseHm(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** Current local minutes-since-midnight + weekday in a company timezone. */
export function localTimeParts(
  timezone: string | null | undefined,
  now = new Date()
): { day: number; minutes: number } {
  const tz = timezone?.trim() || "America/Denver";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);

    const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");

    const dayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    return {
      day: dayMap[weekday] ?? now.getDay(),
      minutes: hour * 60 + minute,
    };
  } catch {
    return { day: now.getDay(), minutes: now.getHours() * 60 + now.getMinutes() };
  }
}

export function ruleMatchesNow(
  rule: HoursBranchRule,
  day: number,
  minutes: number
): boolean {
  if (!rule.days?.includes(day)) return false;
  const start = parseHm(rule.start);
  const end = parseHm(rule.end);
  if (start == null || end == null) return false;
  if (end > start) {
    return minutes >= start && minutes < end;
  }
  // Overnight window (e.g. 22:00–06:00)
  return minutes >= start || minutes < end;
}

/** First matching rule wins; otherwise defaultNextNodeId. */
export function resolveHoursBranchNextNodeId(
  config: HoursBranchConfig,
  timezone?: string | null,
  now = new Date()
): string | null {
  const { day, minutes } = localTimeParts(timezone, now);
  for (const rule of config.rules ?? []) {
    if (ruleMatchesNow(rule, day, minutes) && rule.nextNodeId) {
      return rule.nextNodeId;
    }
  }
  return config.defaultNextNodeId?.trim() || null;
}

export { DAY_NAMES };
