"use client";

import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReportKpiGrid, ReportTable, useReport } from "@/components/reporting/ReportWidgets";

export default function ReportingCsrPage() {
  const { data, loading } = useReport<{
    inbound: number;
    outbound: number;
    totalCalls: number;
    avgDurationSeconds: number;
    daily: Array<{ date: string; inbound: number; outbound: number }>;
  }>("csr");

  return (
    <ContentArea>
      <PageHeader breadcrumb={["Reporting", "CSR"]} title="CSR" />
      {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : null}
      {data ? (
        <div className="space-y-6">
          <ReportKpiGrid
            cards={[
              { label: "Total calls (30d)", value: String(data.totalCalls) },
              { label: "Inbound", value: String(data.inbound) },
              { label: "Outbound", value: String(data.outbound) },
              { label: "Avg duration (sec)", value: String(data.avgDurationSeconds) },
            ]}
          />
          <ReportTable
            columns={["Date", "Inbound", "Outbound"]}
            rows={data.daily.map((d) => [d.date, d.inbound, d.outbound])}
          />
        </div>
      ) : null}
    </ContentArea>
  );
}
