"use client";

import Link from "next/link";
import { PartsSuppliersManager } from "@/components/settings/parts-suppliers/PartsSuppliersManager";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { useIrrigationFeatures } from "@/components/layout/CompanyBrandProvider";

export default function PartsSuppliersSettingsPage() {
  const { enabled: irrigationEnabled } = useIrrigationFeatures();

  return (
    <ContentArea className="max-w-6xl">
      <PageHeader
        title="Suppliers"
        subtitle="Configure irrigation parts suppliers. Technicians can pause the visit timer and navigate to the nearest open store."
      />
      {irrigationEnabled ? (
        <PartsSuppliersManager />
      ) : (
        <div className="rounded-lg border border-border bg-white p-6 text-sm text-muted-foreground">
          Irrigation tools are turned off for this company. Enable them under{" "}
          <Link href="/settings" className="text-primary underline">
            Settings → Company → Industry features
          </Link>
          .
        </div>
      )}
    </ContentArea>
  );
}
