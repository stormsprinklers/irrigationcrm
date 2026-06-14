"use client";

import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReportKpiGrid, useReport } from "@/components/reporting/ReportWidgets";

export default function ReportingVoicePage() {
  const { data, loading } = useReport<{
    total: number;
    missed: number;
    avgDurationSeconds: number;
  }>("voice");

  return (
    <ContentArea>
      <PageHeader breadcrumb={["Reporting", "Voice"]} title="Voice" />
      {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : null}
      {data ? (
        <ReportKpiGrid
          cards={[
            { label: "Total calls (30d)", value: String(data.total) },
            { label: "Missed / no answer", value: String(data.missed) },
            { label: "Avg duration (sec)", value: String(data.avgDurationSeconds) },
          ]}
        />
      ) : null}
    </ContentArea>
  );
}
