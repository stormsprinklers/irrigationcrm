"use client";

import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReportTable, useReport } from "@/components/reporting/ReportWidgets";

export default function ReportingInvoicesPage() {
  const { data, loading } = useReport<{
    buckets: Array<{ label: string; count: number; totalFormatted: string }>;
  }>("invoices");

  return (
    <ContentArea>
      <PageHeader breadcrumb={["Reporting", "Invoices"]} title="Invoices" />
      {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : null}
      {data ? (
        <ReportTable
          columns={["Aging bucket", "Count", "Balance"]}
          rows={data.buckets.map((b) => [b.label, b.count, b.totalFormatted])}
        />
      ) : null}
    </ContentArea>
  );
}
