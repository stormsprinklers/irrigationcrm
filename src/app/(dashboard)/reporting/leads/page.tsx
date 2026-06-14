"use client";

import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReportKpiGrid, ReportTable, useReport } from "@/components/reporting/ReportWidgets";

export default function ReportingLeadsPage() {
  const { data, loading } = useReport<{
    total: number;
    byStatus: Array<{ status: string; count: number }>;
    bySource: Array<{ source: string; count: number }>;
  }>("leads");

  return (
    <ContentArea>
      <PageHeader breadcrumb={["Reporting", "Leads"]} title="Leads" />
      {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : null}
      {data ? (
        <div className="space-y-6">
          <ReportKpiGrid cards={[{ label: "Total leads", value: String(data.total) }]} />
          <ReportTable
            columns={["Status", "Count"]}
            rows={data.byStatus.map((s) => [s.status, s.count])}
          />
          <ReportTable
            columns={["Source", "Count"]}
            rows={data.bySource.map((s) => [s.source, s.count])}
          />
        </div>
      ) : null}
    </ContentArea>
  );
}
