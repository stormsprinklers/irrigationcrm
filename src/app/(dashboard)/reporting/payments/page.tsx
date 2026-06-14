"use client";

import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReportKpiGrid, ReportTable, useReport } from "@/components/reporting/ReportWidgets";

export default function ReportingPaymentsPage() {
  const { data, loading } = useReport<{
    refundCount: number;
    byMethod: Array<{ method: string; count: number; totalFormatted: string }>;
  }>("payments");

  return (
    <ContentArea>
      <PageHeader breadcrumb={["Reporting", "Payments"]} title="Payments" />
      {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : null}
      {data ? (
        <div className="space-y-6">
          <ReportKpiGrid cards={[{ label: "Refunds", value: String(data.refundCount) }]} />
          <ReportTable
            columns={["Method", "Count", "Total"]}
            rows={data.byMethod.map((m) => [m.method, m.count, m.totalFormatted])}
          />
        </div>
      ) : null}
    </ContentArea>
  );
}
