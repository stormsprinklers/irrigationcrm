import type { SupplierHoursJson, SupplierHoursPeriod } from "./types";

function minutesSinceMidnight(hour: number, minute: number) {
  return hour * 60 + minute;
}

function isOpenAtPeriods(periods: SupplierHoursPeriod[], now: Date, timeZone: string): boolean {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number.parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute = Number.parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);

  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const currentDay = dayMap[weekday] ?? now.getDay();
  const currentMinutes = minutesSinceMidnight(hour, minute);

  for (const period of periods) {
    const openDay = period.open.day;
    const openMinutes = minutesSinceMidnight(period.open.hour, period.open.minute);
    if (!period.close) {
      if (currentDay === openDay && currentMinutes >= openMinutes) return true;
      continue;
    }

    const closeDay = period.close.day;
    const closeMinutes = minutesSinceMidnight(period.close.hour, period.close.minute);

    if (openDay === closeDay) {
      if (currentDay === openDay && currentMinutes >= openMinutes && currentMinutes < closeMinutes) {
        return true;
      }
      continue;
    }

    if (currentDay === openDay && currentMinutes >= openMinutes) return true;
    if (currentDay === closeDay && currentMinutes < closeMinutes) return true;

    let day = (openDay + 1) % 7;
    while (day !== closeDay) {
      if (currentDay === day) return true;
      day = (day + 1) % 7;
    }
  }

  return false;
}

export function isSupplierOpenNow(
  hours: SupplierHoursJson | null | undefined,
  timeZone: string,
  now = new Date()
): boolean {
  if (!hours) return true;

  if (typeof hours.openNow === "boolean") {
    return hours.openNow;
  }

  if (hours.periods?.length) {
    return isOpenAtPeriods(hours.periods, now, timeZone);
  }

  return true;
}

export function todayHoursLabel(
  weekdayHours: string[],
  now = new Date(),
  timeZone = "America/Denver"
): string | null {
  if (!weekdayHours.length) return null;

  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(now);
  const match = weekdayHours.find((line) => line.toLowerCase().startsWith(weekday.toLowerCase()));
  return match ?? weekdayHours[0] ?? null;
}
