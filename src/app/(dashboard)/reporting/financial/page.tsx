"use client";

import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReportTable, useReport } from "@/components/reporting/ReportWidgets";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export default function ReportingFinancialPage() {
  const { data, loading } = useReport<{ months: Array<{ month: string; revenue: number; payments: number }> }>("financial");

  return (
    <ContentArea>
      <PageHeader breadcrumb={["Reporting", "Financial"]} title="Financial" />
      {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : null}
      {data ? (
        <ReportTable
          columns={["Month", "Invoiced", "Payments collected"]}
          rows={data.months.map((m) => [m.month, formatCurrency(m.revenue), formatCurrency(m.payments)])}
        />
      ) : null}
    </ContentArea>
  );
}
