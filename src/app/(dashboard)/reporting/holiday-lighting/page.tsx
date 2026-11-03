"use client";

import { useEffect, useState } from "react";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReportDateRangeControl } from "@/components/reporting/ReportDateRangeControl";
import { ReportKpiGrid } from "@/components/reporting/ReportWidgets";
import {
  ADMIN_HOME_KPI_PRESETS,
  PRESET_RANGE_LABELS,
  buildReportRangeQuery,
  type ReportRangeInput,
} from "@/lib/reporting/date-range";
import type { HolidaySalesStats } from "@/lib/reporting/holiday-lighting-sales";

type EmployeeSalesRow = HolidaySalesStats & {
  employeeId: string | null;
  employeeName: string;
  shortName: string;
};

type ReportData = {
  rangeLabel: string;
  currentUserId: string;
  company: HolidaySalesStats;
  employees: EmployeeSalesRow[];
};

function currency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function percent(value: number) {
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

export default function HolidayLightingSalesReportPage() {
  const [range, setRange] = useState<ReportRangeInput>({ preset: "ytd" });
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    fetch(`/api/reporting/holiday-lighting-sales?${buildReportRangeQuery(range)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load report");
        return response.json() as Promise<ReportData>;
      })
      .then(setData)
      .catch((loadError) => {
        if (!(loadError instanceof DOMException && loadError.name === "AbortError")) {
          setError(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [range]);

  const rangeLabel =
    data?.rangeLabel ??
    (range.preset === "custom"
      ? `${range.start} – ${range.end}`
      : PRESET_RANGE_LABELS[range.preset]);

  return (
    <ContentArea>
      <PageHeader
        breadcrumb={["Reporting", "Holiday lighting sales"]}
        title="Holiday lighting sales"
        subtitle="Compare quote performance by the employee who sent each estimate. The selected time span is based on the estimate sent date."
        actions={
          <ReportDateRangeControl
            value={range}
            label={rangeLabel}
            onChange={setRange}
            presets={ADMIN_HOME_KPI_PRESETS}
            allowCustom
          />
        }
      />

      {loading ? <p className="text-sm text-muted-foreground">Loading report...</p> : null}
      {error ? <p className="text-sm text-destructive">Could not load the holiday lighting sales report.</p> : null}
      {data ? (
        <div className="space-y-6">
          <ReportKpiGrid
            cards={[
              { label: "Company quotes sent", value: String(data.company.sentCount) },
              { label: "Company conversion rate", value: percent(data.company.conversionRate) },
              { label: "Company average ticket", value: currency(data.company.averageTicket) },
              { label: "Company total sales", value: currency(data.company.totalSales) },
            ]}
          />

          <div className="overflow-x-auto rounded-lg border border-border bg-white">
            <table className="w-full min-w-[850px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  <th className="px-4 py-3 font-medium">Employee</th>
                  <th className="px-4 py-3 font-medium">
                    <span className="block">Quotes sent</span>
                    <span className="text-xs font-normal text-muted-foreground">Company: {data.company.sentCount}</span>
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <span className="block">Approved</span>
                    <span className="text-xs font-normal text-muted-foreground">Company: {data.company.approvedCount}</span>
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <span className="block">Conversion rate</span>
                    <span className="text-xs font-normal text-muted-foreground">Company: {percent(data.company.conversionRate)}</span>
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <span className="block">Average ticket</span>
                    <span className="text-xs font-normal text-muted-foreground">Company: {currency(data.company.averageTicket)}</span>
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <span className="block">Total sales</span>
                    <span className="text-xs font-normal text-muted-foreground">Company: {currency(data.company.totalSales)}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.employees.map((employee) => {
                  const isCurrentUser = employee.employeeId === data.currentUserId;
                  return (
                    <tr
                      key={employee.employeeId ?? "unattributed"}
                      className={`border-b border-border last:border-0 ${isCurrentUser ? "bg-primary/5" : ""}`}
                    >
                      <td className="px-4 py-3 font-medium">
                        {employee.employeeName}
                        {isCurrentUser ? <span className="ml-2 text-xs text-primary">You</span> : null}
                      </td>
                      <td className="px-4 py-3">{employee.sentCount}</td>
                      <td className="px-4 py-3">{employee.approvedCount}</td>
                      <td className="px-4 py-3">{percent(employee.conversionRate)}</td>
                      <td className="px-4 py-3">{currency(employee.averageTicket)}</td>
                      <td className="px-4 py-3 font-medium">{currency(employee.totalSales)}</td>
                    </tr>
                  );
                })}
                {!data.employees.length ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      No holiday lighting estimates were sent during this time span.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Conversion, average ticket, and sales use approved holiday lighting estimates from the selected sent-date cohort. Historical estimates without a recorded sender appear as Unattributed.
          </p>
        </div>
      ) : null}
    </ContentArea>
  );
}
