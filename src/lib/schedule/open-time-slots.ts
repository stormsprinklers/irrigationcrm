import type { Division } from "@prisma/client";
import type { WorkScheduleDayDTO } from "@/lib/schedule/time-off-types";

export type BookingWindow = {
  start: string; // HH:mm
  end: string;
};

export type DivisionBookingWindows = {
  SERVICE: BookingWindow[];
  INSTALL: BookingWindow[];
};

/** Service: morning / midday / afternoon. Install: full workday. */
export const DEFAULT_DIVISION_BOOKING_WINDOWS: DivisionBookingWindows = {
  SERVICE: [
    { start: "08:00", end: "11:00" },
    { start: "11:00", end: "14:00" },
    { start: "14:00", end: "17:00" },
  ],
  INSTALL: [{ start: "08:00", end: "16:00" }],
};

export const DEFAULT_WORK_DAY_START = "08:00";
export const DEFAULT_WORK_DAY_END = "16:00";

export function defaultEmployeeWorkSchedule(): WorkScheduleDayDTO[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
    return {
      dayOfWeek,
      isWorking: isWeekday,
      startTime: isWeekday ? DEFAULT_WORK_DAY_START : null,
      endTime: isWeekday ? DEFAULT_WORK_DAY_END : null,
    };
  });
}

export function parseDivisionBookingWindows(raw: unknown): DivisionBookingWindows {
  if (!raw || typeof raw !== "object") {
    return structuredClone(DEFAULT_DIVISION_BOOKING_WINDOWS);
  }
  const obj = raw as Record<string, unknown>;
  return {
    SERVICE: normalizeWindows(obj.SERVICE) ?? DEFAULT_DIVISION_BOOKING_WINDOWS.SERVICE,
    INSTALL: normalizeWindows(obj.INSTALL) ?? DEFAULT_DIVISION_BOOKING_WINDOWS.INSTALL,
  };
}

function normalizeWindows(value: unknown): BookingWindow[] | null {
  if (!Array.isArray(value)) return null;
  const windows: BookingWindow[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const start = normalizeHhMm(String((item as BookingWindow).start ?? ""));
    const end = normalizeHhMm(String((item as BookingWindow).end ?? ""));
    if (!start || !end) continue;
    if (toMinutes(end) <= toMinutes(start)) continue;
    windows.push({ start, end });
  }
  return windows.length ? dedupeNonOverlapping(windows) : null;
}

export function isValidHhMm(value: string) {
  return /^\d{1,2}:\d{2}(:\d{2})?$/.test(value);
}

export function normalizeHhMm(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function fromMinutes(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Sort and merge overlapping windows so dashed boxes never overlap. */
export function dedupeNonOverlapping(windows: BookingWindow[]): BookingWindow[] {
  const sorted = [...windows].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  const result: BookingWindow[] = [];
  for (const window of sorted) {
    const last = result[result.length - 1];
    if (!last) {
      result.push(window);
      continue;
    }
    const lastEnd = toMinutes(last.end);
    const start = toMinutes(window.start);
    const end = toMinutes(window.end);
    if (start < lastEnd) {
      // Overlap: extend previous end if needed (keep a single box).
      if (end > lastEnd) last.end = window.end;
    } else {
      result.push({ ...window });
    }
  }
  return result;
}

export function workDayForDate(
  schedule: WorkScheduleDayDTO[],
  dayOfWeek: number
): WorkScheduleDayDTO | null {
  return schedule.find((d) => d.dayOfWeek === dayOfWeek) ?? null;
}

export function isWorkingOnDay(
  schedule: WorkScheduleDayDTO[] | undefined,
  dayOfWeek: number
) {
  const days = schedule && schedule.length > 0 ? schedule : defaultEmployeeWorkSchedule();
  return Boolean(workDayForDate(days, dayOfWeek)?.isWorking);
}

/**
 * Hours on the schedule grid that are outside this employee's work day.
 * Full-day OFF when they are not working that weekday.
 */
export function offWindowsForDay(
  schedule: WorkScheduleDayDTO[] | undefined,
  dayOfWeek: number,
  gridStart = "04:00",
  gridEnd = "23:00"
): BookingWindow[] {
  const days = schedule && schedule.length > 0 ? schedule : defaultEmployeeWorkSchedule();
  const day = workDayForDate(days, dayOfWeek);
  if (!day?.isWorking) {
    return [{ start: gridStart, end: gridEnd }];
  }

  const workStart = day.startTime ?? DEFAULT_WORK_DAY_START;
  const workEnd = day.endTime ?? DEFAULT_WORK_DAY_END;
  const windows: BookingWindow[] = [];
  if (toMinutes(workStart) > toMinutes(gridStart)) {
    windows.push({ start: gridStart, end: workStart });
  }
  if (toMinutes(workEnd) < toMinutes(gridEnd)) {
    windows.push({ start: workEnd, end: gridEnd });
  }
  return windows;
}

/** Client/server copy for why a visit cannot be assigned on this work schedule. */
export function assignmentOffMessage(
  employeeName: string,
  schedule: WorkScheduleDayDTO[] | undefined,
  dayOfWeek: number,
  startMinutes: number,
  endMinutes: number
): string | null {
  const days = schedule && schedule.length > 0 ? schedule : defaultEmployeeWorkSchedule();
  const day = workDayForDate(days, dayOfWeek);
  if (!day?.isWorking) {
    return `${employeeName} is off this day`;
  }
  if (!day.startTime || !day.endTime) return null;
  const windowStart = toMinutes(day.startTime);
  const windowEnd = toMinutes(day.endTime);
  if (startMinutes < windowStart || endMinutes > windowEnd) {
    return `${employeeName} is only working ${day.startTime}–${day.endTime} this day`;
  }
  return null;
}

/**
 * Intersect division booking windows with the employee's work hours for a day.
 * Adjacent windows that only touch (11:00–11:00) stay separate.
 */
export function openSlotsForDay(
  schedule: WorkScheduleDayDTO[],
  dayOfWeek: number,
  divisionWindows: BookingWindow[]
): BookingWindow[] {
  const day = workDayForDate(schedule, dayOfWeek);
  if (!day?.isWorking) return [];

  const workStart = toMinutes(day.startTime ?? DEFAULT_WORK_DAY_START);
  const workEnd = toMinutes(day.endTime ?? DEFAULT_WORK_DAY_END);
  if (workEnd <= workStart) return [];

  const clipped: BookingWindow[] = [];
  for (const window of divisionWindows) {
    const start = Math.max(workStart, toMinutes(window.start));
    const end = Math.min(workEnd, toMinutes(window.end));
    if (end > start) {
      clipped.push({ start: fromMinutes(start), end: fromMinutes(end) });
    }
  }

  return dedupeNonOverlapping(clipped);
}

export function windowsForDivision(
  windows: DivisionBookingWindows,
  division: Division | null | undefined
): BookingWindow[] {
  if (division === "INSTALL") return windows.INSTALL;
  return windows.SERVICE;
}
