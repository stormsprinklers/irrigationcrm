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
