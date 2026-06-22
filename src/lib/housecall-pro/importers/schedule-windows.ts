import type { BatchResult, ImportContext, HcpRecord } from "@/lib/housecall-pro/types";
import { DEFAULT_BUSINESS_HOURS, type BusinessHoursDay } from "@/lib/company/types";
import { prisma } from "@/lib/prisma";

const DAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

function mapScheduleWindows(records: HcpRecord[]): Record<string, BusinessHoursDay> {
  const hours: Record<string, BusinessHoursDay> = { ...DEFAULT_BUSINESS_HOURS };

  for (const record of records) {
    const dayIndex = Number(record.day_of_week ?? record.day);
    const dayKey =
      typeof record.day === "string" && DAY_KEYS.includes(record.day as (typeof DAY_KEYS)[number])
        ? (record.day as string)
        : DAY_KEYS[Number.isFinite(dayIndex) ? dayIndex : -1];
    if (!dayKey || !(dayKey in hours)) continue;

    hours[dayKey] = {
      open: record.closed !== true && record.open !== false,
      start: String(record.start_time ?? record.start ?? hours[dayKey].start),
      end: String(record.end_time ?? record.end ?? hours[dayKey].end),
    };
  }

  return hours;
}

export async function importScheduleWindowsBatch(ctx: ImportContext): Promise<BatchResult> {
  const result: BatchResult = {
    done: true,
    cursor: null,
    processed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  if (ctx.cursor) {
    return result;
  }

  try {
    const data = await ctx.client.get<HcpRecord>("/company/schedule_windows");
    const windows = Array.isArray(data.schedule_windows)
      ? (data.schedule_windows as HcpRecord[])
      : Array.isArray(data.windows)
        ? (data.windows as HcpRecord[])
        : Array.isArray(data.data)
          ? (data.data as HcpRecord[])
          : [];

    result.processed = windows.length;
    const businessHours = mapScheduleWindows(windows);

    await prisma.company.update({
      where: { id: ctx.companyId },
      data: { businessHours },
    });
    result.updated = 1;
  } catch (err) {
    result.failed = 1;
    result.errors.push(
      err instanceof Error ? err.message : "Schedule windows import failed"
    );
  }

  return result;
}
