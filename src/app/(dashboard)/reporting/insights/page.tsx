"use client";

import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReportKpiGrid, useReport } from "@/components/reporting/ReportWidgets";

export default function ReportingInsightsPage() {
  const { data, loading, error } = useReport<{ cards: { label: string; value: string }[] }>("insights");

  return (
    <ContentArea>
      <PageHeader breadcrumb={["Reporting", "Business insights"]} title="Business insights" />
      {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : null}
      {error ? <p className="text-sm text-destructive">Failed to load report.</p> : null}
      {data ? <ReportKpiGrid cards={data.cards} /> : null}
    </ContentArea>
  );
}
