import { EstimateStatus } from "@prisma/client";
import { employeeFirstNameLastInitial } from "@/lib/employees";
import { prisma } from "@/lib/prisma";
import type { ResolvedReportRange } from "@/lib/reporting/date-range";
import { toNumber } from "@/lib/visits/totals";

type HolidayEstimateSale = {
  sentById: string | null;
  status: EstimateStatus;
  total: number;
  selectedOptionTotal: number | null;
  employee: {
    firstName: string;
    lastName: string;
    name: string;
  } | null;
};

export type HolidaySalesStats = {
  sentCount: number;
  approvedCount: number;
  conversionRate: number;
  averageTicket: number;
  totalSales: number;
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function statsFor(estimates: HolidayEstimateSale[]): HolidaySalesStats {
  const approved = estimates.filter(
    (estimate) =>
      estimate.status === EstimateStatus.APPROVED ||
      estimate.status === EstimateStatus.CONVERTED
  );
  const totalSales = roundMoney(
    approved.reduce(
      (sum, estimate) => sum + (estimate.selectedOptionTotal ?? estimate.total),
      0
    )
  );
  return {
    sentCount: estimates.length,
    approvedCount: approved.length,
    conversionRate:
      estimates.length > 0
        ? Math.round((approved.length / estimates.length) * 1000) / 10
        : 0,
    averageTicket: approved.length > 0 ? roundMoney(totalSales / approved.length) : 0,
    totalSales,
  };
}

export function summarizeHolidayLightingSales(estimates: HolidayEstimateSale[]) {
  const groups = new Map<string, HolidayEstimateSale[]>();
  for (const estimate of estimates) {
    const key = estimate.sentById ?? "unattributed";
    const group = groups.get(key) ?? [];
    group.push(estimate);
    groups.set(key, group);
  }

  const employees = [...groups.entries()].map(([employeeId, rows]) => {
    const employee = rows.find((row) => row.employee)?.employee ?? null;
    return {
      employeeId: employeeId === "unattributed" ? null : employeeId,
      employeeName: employee?.name?.trim() || "Unattributed",
      shortName: employee
        ? employeeFirstNameLastInitial(employee) || employee.name
        : "Unattributed",
      ...statsFor(rows),
    };
  });

  employees.sort(
    (a, b) =>
      b.totalSales - a.totalSales ||
      b.approvedCount - a.approvedCount ||
      a.employeeName.localeCompare(b.employeeName)
  );

  return { company: statsFor(estimates), employees };
}

export async function getHolidayLightingSalesReport(
  companyId: string,
  range: ResolvedReportRange
) {
  const estimates = await prisma.estimate.findMany({
    where: {
      companyId,
      OR: [
        { sentByAt: { gte: range.start, lte: range.end } },
        {
          sentByAt: null,
          sentAt: { gte: range.start, lte: range.end },
        },
      ],
      designExportMetadata: {
        path: ["source"],
        equals: "holiday-lighting-quote",
      },
    },
    select: {
      sentById: true,
      status: true,
      total: true,
      selectedOption: { select: { total: true } },
      sentBy: {
        select: { firstName: true, lastName: true, name: true },
      },
    },
    orderBy: [{ sentByAt: "asc" }, { sentAt: "asc" }, { id: "asc" }],
  });

  return {
    rangeLabel: range.label,
    ...summarizeHolidayLightingSales(
      estimates.map((estimate) => ({
        sentById: estimate.sentById,
        status: estimate.status,
        total: toNumber(estimate.total),
        selectedOptionTotal:
          estimate.selectedOption?.total != null
            ? toNumber(estimate.selectedOption.total)
            : null,
        employee: estimate.sentBy,
      }))
    ),
  };
}
