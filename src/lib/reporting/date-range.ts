import { endOfDay, format, isValid, parseISO, startOfDay, startOfMonth, startOfYear, subDays } from "date-fns";

export type ReportPresetRange = "ytd" | "mtd" | "last30";

export type ReportRangeInput =
  | { preset: ReportPresetRange }
  | { preset: "custom"; start: string; end: string };

export type ResolvedReportRange = {
  preset: ReportPresetRange | "custom";
  start: Date;
  end: Date;
  label: string;
};

export const PRESET_RANGE_LABELS: Record<ReportPresetRange, string> = {
  ytd: "Year to date",
  mtd: "Month to date",
  last30: "Last 30 days",
};

function presetBounds(preset: ReportPresetRange): { start: Date; end: Date } {
  const now = new Date();
  const end = endOfDay(now);
  if (preset === "mtd") return { start: startOfMonth(now), end };
  if (preset === "last30") return { start: startOfDay(subDays(now, 30)), end };
  return { start: startOfYear(now), end };
}

function parseDateOnly(value: string): Date | null {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const parsed = parseISO(trimmed);
  return isValid(parsed) ? parsed : null;
}

export function resolveReportRange(input: ReportRangeInput): ResolvedReportRange {
  if (input.preset !== "custom") {
    const { start, end } = presetBounds(input.preset);
    return {
      preset: input.preset,
      start,
      end,
      label: PRESET_RANGE_LABELS[input.preset],
    };
  }

  const startDate = parseDateOnly(input.start);
  const endDate = parseDateOnly(input.end);
  if (!startDate || !endDate) {
    throw new Error("Invalid custom date range");
  }

  const start = startOfDay(startDate);
  const end = endOfDay(endDate);
  if (start > end) {
    throw new Error("Start date must be on or before end date");
  }

  return {
    preset: "custom",
    start,
    end,
    label: `${format(start, "MMM d, yyyy")} – ${format(end, "MMM d, yyyy")}`,
  };
}

export function parseReportRangeFromSearchParams(searchParams: URLSearchParams): ReportRangeInput {
  const range = searchParams.get("range");
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (range === "custom" && start && end) {
    return { preset: "custom", start, end };
  }
  if (range === "mtd" || range === "last30") {
    return { preset: range };
  }
  return { preset: "ytd" };
}

export function buildReportRangeQuery(input: ReportRangeInput): string {
  if (input.preset === "custom") {
    return `range=custom&start=${encodeURIComponent(input.start)}&end=${encodeURIComponent(input.end)}`;
  }
  return `range=${input.preset}`;
}

export function formatDateInputValue(date: Date): string {
  return format(date, "yyyy-MM-dd");
}
