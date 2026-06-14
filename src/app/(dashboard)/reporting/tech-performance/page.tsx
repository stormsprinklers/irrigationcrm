"use client";

import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReportTable, useReport } from "@/components/reporting/ReportWidgets";

export default function ReportingTechPerformancePage() {
  const { data, loading } = useReport<{
    rows: Array<{ name: string; visitsCompleted: number; revenueFormatted: string; avgJobSize: string; hours: number }>;
  }>("tech-performance");

  return (
    <ContentArea>
      <PageHeader breadcrumb={["Reporting", "Tech Performance"]} title="Tech Performance" />
      {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : null}
      {data ? (
        <ReportTable
          columns={["Technician", "Visits completed", "Revenue", "Avg job size", "Hours"]}
          rows={data.rows.map((r) => [r.name, r.visitsCompleted, r.revenueFormatted, r.avgJobSize, r.hours])}
        />
      ) : null}
    </ContentArea>
  );
}
