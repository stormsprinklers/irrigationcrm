import assert from "node:assert/strict";
import test from "node:test";
import { EstimateStatus } from "@prisma/client";
import { summarizeHolidayLightingSales } from "./holiday-lighting-sales";

test("holiday sales stats compare employees with company totals", () => {
  const report = summarizeHolidayLightingSales([
    {
      sentById: "alex",
      status: EstimateStatus.APPROVED,
      total: 900,
      selectedOptionTotal: 1_000,
      employee: { firstName: "Alex", lastName: "Morgan", name: "Alex Morgan" },
    },
    {
      sentById: "alex",
      status: EstimateStatus.SENT,
      total: 500,
      selectedOptionTotal: null,
      employee: { firstName: "Alex", lastName: "Morgan", name: "Alex Morgan" },
    },
    {
      sentById: "jamie",
      status: EstimateStatus.CONVERTED,
      total: 750,
      selectedOptionTotal: null,
      employee: { firstName: "Jamie", lastName: "Lee", name: "Jamie Lee" },
    },
  ]);

  assert.deepEqual(report.company, {
    sentCount: 3,
    approvedCount: 2,
    conversionRate: 66.7,
    averageTicket: 875,
    totalSales: 1_750,
  });
  assert.deepEqual(report.employees[0], {
    employeeId: "alex",
    employeeName: "Alex Morgan",
    shortName: "Alex M.",
    sentCount: 2,
    approvedCount: 1,
    conversionRate: 50,
    averageTicket: 1_000,
    totalSales: 1_000,
  });
});
