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
    disposition: {
      booked: number;
      notBooked: number;
      nonOpportunity: number;
      none: number;
      bookRate: number;
      nonOpportunityRate: number;
    };
    byAgent: Array<{ name: string; total: number; booked: number; bookRate: number }>;
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
              { label: "Book rate", value: `${data.disposition.bookRate}%` },
              { label: "Non-opportunity", value: `${data.disposition.nonOpportunityRate}%` },
            ]}
          />
          <ReportKpiGrid
            cards={[
              { label: "Booked", value: String(data.disposition.booked) },
              { label: "Not booked", value: String(data.disposition.notBooked) },
              { label: "Non-opportunity", value: String(data.disposition.nonOpportunity) },
              { label: "Avg duration (sec)", value: String(data.avgDurationSeconds) },
            ]}
          />
          <ReportTable
            columns={["Date", "Inbound", "Outbound"]}
            rows={data.daily.map((d) => [d.date, d.inbound, d.outbound])}
          />
          {data.byAgent.length > 0 && (
            <ReportTable
              columns={["Agent", "Dispositioned", "Booked", "Book rate"]}
              rows={data.byAgent.map((a) => [a.name, a.total, a.booked, `${a.bookRate}%`])}
            />
          )}
        </div>
      ) : null}
    </ContentArea>
  );
}
