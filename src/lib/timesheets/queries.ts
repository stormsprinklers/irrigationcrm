import { prisma } from "@/lib/prisma";
import {
  computeEntryDurationHours,
  getPayPeriodBounds,
} from "@/lib/timesheets/clock";
import {
  computeVisitCommission,
} from "@/lib/compensation/commission";
import {
  effectiveHourlyCost,
  usesCommissionPay,
  usesHourlyPay,
} from "@/lib/compensation/rates";
import { toNumber } from "@/lib/visits/totals";
import type { PayType, VisitStatus } from "@prisma/client";

export type TimesheetEntryRow = {
  id: string;
  userId: string;
  userName: string;
  clockInAt: string;
  clockOutAt: string | null;
  durationHours: number;
  inProgress: boolean;
};

export async function listTimesheetEntries(
  companyId: string,
  params: { from: Date; to: Date; userId?: string }
) {
  const entries = await prisma.timeClockEntry.findMany({
    where: {
      companyId,
      ...(params.userId ? { userId: params.userId } : {}),
      clockInAt: { gte: params.from, lte: params.to },
    },
    include: { user: { select: { id: true, name: true } } },
    orderBy: [{ clockInAt: "desc" }],
  });

  return entries.map((entry): TimesheetEntryRow => ({
    id: entry.id,
    userId: entry.userId,
    userName: entry.user.name,
    clockInAt: entry.clockInAt.toISOString(),
    clockOutAt: entry.clockOutAt?.toISOString() ?? null,
    durationHours: computeEntryDurationHours(entry),
    inProgress: entry.clockOutAt == null,
  }));
}

type UserPaySummary = {
  id: string;
  name: string;
  payType: PayType | null;
  hourlyRate: unknown;
  commissionPercent: unknown;
  annualSalary: unknown;
};

export async function summarizePayPeriod(
  user: UserPaySummary,
  companyId: string,
  periodBounds: { start: Date; end: Date }
) {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { commissionBasis: true },
  });

  const clockEntries = await prisma.timeClockEntry.findMany({
    where: {
      userId: user.id,
      clockInAt: { gte: periodBounds.start, lte: periodBounds.end },
    },
  });

  const clockedHours = clockEntries.reduce(
    (sum, entry) => sum + computeEntryDurationHours(entry),
    0
  );

  const hourlyRate = effectiveHourlyCost(user);
  const hourlyPay =
    usesHourlyPay(user.payType) && hourlyRate != null
      ? Math.round(clockedHours * hourlyRate * 100) / 100
      : 0;

  let commissionPay = 0;
  if (usesCommissionPay(user.payType) && user.commissionPercent != null) {
    const visits = await prisma.visit.findMany({
      where: {
        companyId,
        assignedUserId: user.id,
        status: "COMPLETED" as VisitStatus,
        updatedAt: { gte: periodBounds.start, lte: periodBounds.end },
      },
      include: {
        lineItems: true,
        discounts: true,
        invoices: { include: { payments: true } },
      },
    });

    const percent = toNumber(user.commissionPercent);
    for (const visit of visits) {
      commissionPay += await computeVisitCommission(
        visit,
        company.commissionBasis,
        percent
      );
    }
    commissionPay = Math.round(commissionPay * 100) / 100;
  }

  let projectedPayout = hourlyPay;
  if (user.payType === "HYBRID") {
    projectedPayout = Math.max(hourlyPay, commissionPay);
  } else if (user.payType === "COMMISSION") {
    projectedPayout = commissionPay;
  } else if (user.payType === "HOURLY") {
    projectedPayout = hourlyPay;
  } else if (user.payType === "SALARY" && user.annualSalary != null) {
    projectedPayout = Math.round((toNumber(user.annualSalary) / 26) * 100) / 100;
  }

  return {
    clockedHours: Math.round(clockedHours * 100) / 100,
    hourlyPay,
    commissionPay,
    projectedPayout,
  };
}

export async function listPayPeriodSummaries(companyId: string, date = new Date()) {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: {
      payPeriodType: true,
      payPeriodAnchorDate: true,
      commissionBasis: true,
    },
  });

  const bounds = getPayPeriodBounds(company, date);
  const employees = await prisma.user.findMany({
    where: { companyId, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      payType: true,
      hourlyRate: true,
      commissionPercent: true,
      annualSalary: true,
    },
    orderBy: { name: "asc" },
  });

  const summaries = await Promise.all(
    employees.map(async (employee) => ({
      userId: employee.id,
      userName: employee.name,
      payType: employee.payType,
      periodStart: bounds.start.toISOString(),
      periodEnd: bounds.end.toISOString(),
      ...(await summarizePayPeriod(employee, companyId, bounds)),
    }))
  );

  return { bounds, summaries };
}

export { getPayPeriodBounds };
