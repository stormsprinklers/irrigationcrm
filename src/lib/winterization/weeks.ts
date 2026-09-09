export type WinterizationWeek = {
  id: string;
  startDate: string;
  endDate: string;
  label: string;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function ymd(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function addDays(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function formatDay(iso: string, withMonth: boolean) {
  const [year, month, day] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: withMonth ? "long" : undefined,
    day: "numeric",
  });
}

export function formatWinterizationWeekLabel(startDate: string, endDate: string) {
  const sameMonth = startDate.slice(0, 7) === endDate.slice(0, 7);
  return `${formatDay(startDate, true)}–${formatDay(endDate, !sameMonth)}`;
}

export function winterizationSeasonYear(now = new Date()) {
  const year = now.getFullYear();
  const seasonEnd = new Date(year, 10, 6, 23, 59, 59);
  return now > seasonEnd ? year + 1 : year;
}

export function listWinterizationWeeks(now = new Date()): WinterizationWeek[] {
  const year = winterizationSeasonYear(now);
  const weeks: WinterizationWeek[] = [];
  let start = ymd(year, 9, 14);
  const lastStart = ymd(year, 11, 2);
  while (start <= lastStart) {
    const end = addDays(start, 4);
    weeks.push({
      id: start,
      startDate: start,
      endDate: end,
      label: formatWinterizationWeekLabel(start, end),
    });
    start = addDays(start, 7);
  }
  return weeks;
}

export function parseIsoDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1));
}
