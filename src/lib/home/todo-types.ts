export type OfficeTodoRecurrence =
  | "NONE"
  | "DAILY"
  | "WEEKLY"
  | "EVERY_N_DAYS"
  | "WEEKLY_ON_DAY"
  | "MONTHLY_ON_DAY";

export type OfficeTodoDTO = {
  id: string;
  title: string;
  notes: string | null;
  recurrence: OfficeTodoRecurrence;
  recurrenceEvery: number | null;
  completedAt: string | null;
  completedByName: string | null;
  createdByName: string;
  createdAt: string;
};

const OFFICE_TODO_ROLES = new Set(["ADMIN", "MANAGER", "CSR"]);

export function canUseOfficeTodos(role: string) {
  return OFFICE_TODO_ROLES.has(role);
}

export const OFFICE_TODO_WEEKDAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
] as const;

export const OFFICE_TODO_RECURRENCE_LABELS: Record<OfficeTodoRecurrence, string> = {
  NONE: "One-time",
  DAILY: "Daily",
  WEEKLY: "Weekly",
  EVERY_N_DAYS: "Every … days",
  WEEKLY_ON_DAY: "Every week on …",
  MONTHLY_ON_DAY: "Every … of the month",
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function ordinal(n: number) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function parseOfficeTodoRecurrence(
  recurrence: unknown,
  recurrenceEvery?: unknown
): { recurrence: OfficeTodoRecurrence; recurrenceEvery: number | null } {
  if (recurrence === "DAILY" || recurrence === "WEEKLY") {
    return { recurrence, recurrenceEvery: null };
  }
  if (recurrence === "EVERY_N_DAYS") {
    return { recurrence, recurrenceEvery: clampInt(recurrenceEvery, 1, 365, 1) };
  }
  if (recurrence === "WEEKLY_ON_DAY") {
    return { recurrence, recurrenceEvery: clampInt(recurrenceEvery, 0, 6, 1) };
  }
  if (recurrence === "MONTHLY_ON_DAY") {
    return { recurrence, recurrenceEvery: clampInt(recurrenceEvery, 1, 31, 1) };
  }
  return { recurrence: "NONE", recurrenceEvery: null };
}

export function defaultRecurrenceEvery(recurrence: OfficeTodoRecurrence): number | null {
  if (recurrence === "EVERY_N_DAYS") return 1;
  if (recurrence === "WEEKLY_ON_DAY") return 1;
  if (recurrence === "MONTHLY_ON_DAY") return 1;
  return null;
}

export function officeTodoRecurrenceLabel(
  recurrence: OfficeTodoRecurrence,
  recurrenceEvery?: number | null
): string {
  if (recurrence === "NONE") return "One-time";
  if (recurrence === "DAILY") return "Daily";
  if (recurrence === "WEEKLY") return "Weekly";
  if (recurrence === "EVERY_N_DAYS") {
    const n = clampInt(recurrenceEvery, 1, 365, 1);
    return n === 1 ? "Every day" : `Every ${n} days`;
  }
  if (recurrence === "WEEKLY_ON_DAY") {
    const weekday = OFFICE_TODO_WEEKDAYS[clampInt(recurrenceEvery, 0, 6, 1)];
    return `Every ${weekday?.label ?? "Monday"}`;
  }
  const day = clampInt(recurrenceEvery, 1, 31, 1);
  return `Every ${ordinal(day)} of the month`;
}

export function officeTodoRecurrenceHint(
  recurrence: OfficeTodoRecurrence,
  recurrenceEvery?: number | null
): string | null {
  if (recurrence === "NONE") return null;
  if (recurrence === "DAILY") return "Comes back each morning after it is checked off.";
  if (recurrence === "WEEKLY") return "Comes back at the start of next week after it is checked off.";
  if (recurrence === "EVERY_N_DAYS") {
    const n = clampInt(recurrenceEvery, 1, 365, 1);
    return n === 1
      ? "Comes back the next day after it is checked off."
      : `Comes back ${n} days after it is checked off.`;
  }
  if (recurrence === "WEEKLY_ON_DAY") {
    const weekday = OFFICE_TODO_WEEKDAYS[clampInt(recurrenceEvery, 0, 6, 1)];
    return `Comes back each ${weekday?.label ?? "Monday"} after it is checked off.`;
  }
  const day = clampInt(recurrenceEvery, 1, 31, 1);
  return `Comes back on the ${ordinal(day)} of each month. Shorter months use the last day.`;
}

/** Local calendar date in a company timezone. Weekday is 0 = Sunday. */
export function localCalendarDate(
  timezone: string | null | undefined,
  now = new Date()
): { dateKey: string; weekday: number } {
  const tz = timezone?.trim() || "America/Denver";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    }).formatToParts(now);
    const year = parts.find((part) => part.type === "year")?.value ?? "1970";
    const month = parts.find((part) => part.type === "month")?.value ?? "01";
    const day = parts.find((part) => part.type === "day")?.value ?? "01";
    const weekdayLabel = parts.find((part) => part.type === "weekday")?.value ?? "";
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
      dateKey: `${year}-${month}-${day}`,
      weekday: dayMap[weekdayLabel] ?? now.getDay(),
    };
  } catch {
    return {
      dateKey: `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`,
      weekday: now.getDay(),
    };
  }
}

function addDaysToDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return `${utc.getUTCFullYear()}-${pad2(utc.getUTCMonth() + 1)}-${pad2(utc.getUTCDate())}`;
}

function daysBetweenDateKeys(fromKey: string, toKey: string) {
  const [y1, m1, d1] = fromKey.split("-").map(Number);
  const [y2, m2, d2] = toKey.split("-").map(Number);
  const from = Date.UTC(y1, m1 - 1, d1);
  const to = Date.UTC(y2, m2 - 1, d2);
  return Math.round((to - from) / 86_400_000);
}

function daysInMonth(year: number, month1to12: number) {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

function monthlyDueDateKey(dateKey: string, monthDay: number) {
  const [year, month] = dateKey.split("-").map(Number);
  const day = Math.min(monthDay, daysInMonth(year, month));
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function sundayWeekStartKey(dateKey: string, weekday: number) {
  return addDaysToDateKey(dateKey, -weekday);
}

export function shouldReopenRecurringTodo(params: {
  recurrence: OfficeTodoRecurrence;
  recurrenceEvery?: number | null;
  completedAt: Date | string | null;
  timezone: string | null | undefined;
  now?: Date;
}) {
  if (params.recurrence === "NONE" || !params.completedAt) return false;
  const completedAt =
    params.completedAt instanceof Date ? params.completedAt : new Date(params.completedAt);
  if (Number.isNaN(completedAt.getTime())) return false;

  const nowLocal = localCalendarDate(params.timezone, params.now);
  const completedLocal = localCalendarDate(params.timezone, completedAt);

  if (params.recurrence === "DAILY") {
    return completedLocal.dateKey !== nowLocal.dateKey;
  }

  if (params.recurrence === "EVERY_N_DAYS") {
    const n = clampInt(params.recurrenceEvery, 1, 365, 1);
    return daysBetweenDateKeys(completedLocal.dateKey, nowLocal.dateKey) >= n;
  }

  if (params.recurrence === "WEEKLY_ON_DAY") {
    const weekday = clampInt(params.recurrenceEvery, 0, 6, 1);
    const daysSinceDue = (nowLocal.weekday - weekday + 7) % 7;
    const dueKey = addDaysToDateKey(nowLocal.dateKey, -daysSinceDue);
    return completedLocal.dateKey < dueKey;
  }

  if (params.recurrence === "MONTHLY_ON_DAY") {
    const monthDay = clampInt(params.recurrenceEvery, 1, 31, 1);
    const dueKey = monthlyDueDateKey(nowLocal.dateKey, monthDay);
    if (nowLocal.dateKey < dueKey) return false;
    return completedLocal.dateKey < dueKey;
  }

  return (
    sundayWeekStartKey(completedLocal.dateKey, completedLocal.weekday) !==
    sundayWeekStartKey(nowLocal.dateKey, nowLocal.weekday)
  );
}
