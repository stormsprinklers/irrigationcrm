export type OfficeTodoRecurrence = "NONE" | "DAILY" | "WEEKLY";

export type OfficeTodoDTO = {
  id: string;
  title: string;
  notes: string | null;
  recurrence: OfficeTodoRecurrence;
  completedAt: string | null;
  completedByName: string | null;
  createdByName: string;
  createdAt: string;
};

const OFFICE_TODO_ROLES = new Set(["ADMIN", "MANAGER", "CSR"]);

export function canUseOfficeTodos(role: string) {
  return OFFICE_TODO_ROLES.has(role);
}

export const OFFICE_TODO_RECURRENCE_LABELS: Record<OfficeTodoRecurrence, string> = {
  NONE: "One-time",
  DAILY: "Daily",
  WEEKLY: "Weekly",
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
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

export function sundayWeekStartKey(dateKey: string, weekday: number) {
  return addDaysToDateKey(dateKey, -weekday);
}

export function shouldReopenRecurringTodo(params: {
  recurrence: OfficeTodoRecurrence;
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

  return (
    sundayWeekStartKey(completedLocal.dateKey, completedLocal.weekday) !==
    sundayWeekStartKey(nowLocal.dateKey, nowLocal.weekday)
  );
}
