"use client";

import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReportKpiGrid, ReportTable, useReport } from "@/components/reporting/ReportWidgets";

export default function ReportingEstimatesPage() {
  const { data, loading } = useReport<{
    conversionRate: number;
    byStatus: Array<{ status: string; count: number; totalFormatted: string }>;
  }>("estimates");

  return (
    <ContentArea>
      <PageHeader breadcrumb={["Reporting", "Estimates"]} title="Estimates" />
      {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : null}
      {data ? (
        <div className="space-y-6">
          <ReportKpiGrid cards={[{ label: "Conversion rate (sent → approved)", value: `${data.conversionRate}%` }]} />
          <ReportTable
            columns={["Status", "Count", "Total value"]}
            rows={data.byStatus.map((s) => [s.status, s.count, s.totalFormatted])}
          />
        </div>
      ) : null}
    </ContentArea>
  );
}
