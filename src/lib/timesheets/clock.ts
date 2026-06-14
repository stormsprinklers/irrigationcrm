import type { PayPeriodType, TimeClockEntry } from "@prisma/client";
import {
  addDays,
  addMonths,
  endOfDay,
  endOfMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { prisma } from "@/lib/prisma";

export function computeEntryDurationMs(
  entry: Pick<TimeClockEntry, "clockInAt" | "clockOutAt">,
  now = new Date()
) {
  const end = entry.clockOutAt ?? now;
  return Math.max(0, end.getTime() - entry.clockInAt.getTime());
}

export function computeEntryDurationHours(
  entry: Pick<TimeClockEntry, "clockInAt" | "clockOutAt">,
  now = new Date()
) {
  return computeEntryDurationMs(entry, now) / 3600000;
}

export async function getOpenClockEntry(userId: string) {
  return prisma.timeClockEntry.findFirst({
    where: { userId, clockOutAt: null },
    orderBy: { clockInAt: "desc" },
  });
}

export async function clockIn(userId: string, companyId: string) {
  const open = await getOpenClockEntry(userId);
  if (open) {
    throw new Error("Already clocked in");
  }
  return prisma.timeClockEntry.create({
    data: {
      userId,
      companyId,
      clockInAt: new Date(),
    },
  });
}

export async function clockOut(userId: string) {
  const open = await getOpenClockEntry(userId);
  if (!open) {
    throw new Error("Not clocked in");
  }
  return prisma.timeClockEntry.update({
    where: { id: open.id },
    data: { clockOutAt: new Date() },
  });
}

type PayPeriodCompany = {
  payPeriodType: PayPeriodType;
  payPeriodAnchorDate: Date | null;
};

export function getPayPeriodBounds(company: PayPeriodCompany, date = new Date()) {
  const type = company.payPeriodType;

  if (type === "MONTHLY") {
    return { start: startOfMonth(date), end: endOfMonth(date) };
  }

  if (type === "WEEKLY") {
    const start = startOfWeek(date, { weekStartsOn: 0 });
    return { start, end: endOfDay(addDays(start, 6)) };
  }

  const anchor = company.payPeriodAnchorDate ?? new Date("2025-01-01");
  const anchorStart = startOfDay(anchor);
  const daysSince = Math.floor(
    (startOfDay(date).getTime() - anchorStart.getTime()) / 86400000
  );
  const periodIndex = Math.floor(daysSince / 14);
  const start = addDays(anchorStart, periodIndex * 14);
  return { start, end: endOfDay(addDays(start, 13)) };
}

export async function getTodayClockSummary(userId: string) {
  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());
  const entries = await prisma.timeClockEntry.findMany({
    where: {
      userId,
      clockInAt: { gte: todayStart, lte: todayEnd },
    },
    orderBy: { clockInAt: "asc" },
  });

  const totalMs = entries.reduce(
    (sum, entry) => sum + computeEntryDurationMs(entry),
    0
  );

  return { entries, totalHours: totalMs / 3600000 };
}
