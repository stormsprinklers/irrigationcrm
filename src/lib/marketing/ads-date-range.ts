export type AdsDateRange = {
  startDate: string;
  endDate: string;
  label: string;
  presetDays: number | null;
  isAllTime: boolean;
};

function formatUtcDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function utcToday() {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function presetRange(days: number): AdsDateRange {
  const end = utcToday();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return {
    startDate: formatUtcDate(start),
    endDate: formatUtcDate(end),
    label: `Last ${days} days`,
    presetDays: days,
    isAllTime: false,
  };
}

export function parseAdsDateRange(params: URLSearchParams): AdsDateRange {
  const from = params.get("from")?.trim();
  const to = params.get("to")?.trim();
  const preset = params.get("preset")?.trim()?.toLowerCase();
  const daysParam = params.get("days")?.trim()?.toLowerCase();

  if (preset === "all" || daysParam === "all") {
    return {
      startDate: "2000-01-01",
      endDate: formatUtcDate(utcToday()),
      label: "All time",
      presetDays: null,
      isAllTime: true,
    };
  }

  if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    const startDate = from <= to ? from : to;
    const endDate = from <= to ? to : from;
    return {
      startDate,
      endDate,
      label: `${startDate} – ${endDate}`,
      presetDays: null,
      isAllTime: false,
    };
  }

  const days = Number(daysParam ?? 30);
  if (days === 7) return presetRange(7);
  if (days === 90) return presetRange(90);
  return presetRange(30);
}

export function buildAdsDateRangeQuery(range: AdsDateRange): string {
  if (range.isAllTime) return "preset=all";
  if (range.presetDays != null) return `days=${range.presetDays}`;
  return `from=${range.startDate}&to=${range.endDate}`;
}

export function googleAdsDateClause(range: AdsDateRange) {
  if (range.presetDays === 7) return "segments.date DURING LAST_7_DAYS";
  if (range.presetDays === 30) return "segments.date DURING LAST_30_DAYS";
  if (range.presetDays === 90) return "segments.date DURING LAST_90_DAYS";
  return `segments.date BETWEEN '${range.startDate}' AND '${range.endDate}'`;
}

/** Meta insights cannot look back more than 37 months. */
function metaEarliestSinceDate() {
  const date = utcToday();
  date.setUTCMonth(date.getUTCMonth() - 37);
  return formatUtcDate(date);
}

export function metaInsightsField(range: AdsDateRange) {
  if (range.isAllTime) return "insights.date_preset(maximum)";
  if (range.presetDays === 7) return "insights.date_preset(last_7d)";
  if (range.presetDays === 30) return "insights.date_preset(last_30d)";
  if (range.presetDays === 90) return "insights.date_preset(last_90d)";

  const earliest = metaEarliestSinceDate();
  const since = range.startDate < earliest ? earliest : range.startDate;
  return `insights.time_range({'since':'${since}','until':'${range.endDate}'})`;
}
