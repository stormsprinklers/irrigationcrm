import { startOfWeek } from "date-fns";
import { computeEntryDurationHours } from "@/lib/timesheets/clock";
import type { OvertimeSettings } from "@/lib/compensation/defaults";

type ClockEntry = {
  clockInAt: Date;
  clockOutAt: Date | null;
};

export type HourlyPayBreakdown = {
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  hourlyPay: number;
};

export function computeHourlyPayWithOvertime(
  entries: ClockEntry[],
  hourlyRate: number,
  settings: OvertimeSettings,
  now = new Date()
): HourlyPayBreakdown {
  const weeklyHours = new Map<number, number>();

  for (const entry of entries) {
    const weekStart = startOfWeek(entry.clockInAt, { weekStartsOn: 0 }).getTime();
    const hours = computeEntryDurationHours(entry, now);
    weeklyHours.set(weekStart, (weeklyHours.get(weekStart) ?? 0) + hours);
  }

  let regularHours = 0;
  let overtimeHours = 0;
  const threshold = settings.weeklyThresholdHours;
  const multiplier = settings.rateMultiplier;

  for (const hours of weeklyHours.values()) {
    regularHours += Math.min(hours, threshold);
    overtimeHours += Math.max(0, hours - threshold);
  }

  const hourlyPay =
    Math.round(
      (regularHours * hourlyRate + overtimeHours * hourlyRate * multiplier) * 100
    ) / 100;

  return {
    totalHours: Math.round((regularHours + overtimeHours) * 100) / 100,
    regularHours: Math.round(regularHours * 100) / 100,
    overtimeHours: Math.round(overtimeHours * 100) / 100,
    hourlyPay,
  };
}
