"use client";

import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useCompanySettings } from "@/components/settings/useCompanySettings";

export default function SettingsCustomerPortalPage() {
  const { company, setCompany, loading, saving, save } = useCompanySettings();

  if (loading || !company) {
    return (
      <ContentArea className="max-w-2xl">
        <PageHeader breadcrumb={["Settings", "Customer Portal"]} title="Customer Portal" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </ContentArea>
    );
  }

  const toggles = [
    { key: "portalShowJobs" as const, label: "Show jobs" },
    { key: "portalShowEstimates" as const, label: "Show estimates" },
    { key: "portalShowInvoices" as const, label: "Show invoices" },
  ];

  return (
    <ContentArea className="max-w-2xl">
      <PageHeader
        breadcrumb={["Settings", "Customer Portal"]}
        title="Customer Portal"
        actions={<Button size="sm" onClick={() => save(company)} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>}
      />
      <div className="space-y-4 rounded-lg border border-border bg-white p-6">
        <label className="flex items-center gap-3 text-sm">
          <Checkbox
            checked={company.portalEnabled}
            onCheckedChange={(checked) => setCompany({ ...company, portalEnabled: Boolean(checked) })}
          />
          Enable customer portal
        </label>
        {toggles.map((t) => (
          <label key={t.key} className="flex items-center gap-3 text-sm">
            <Checkbox
              checked={company[t.key]}
              onCheckedChange={(checked) => setCompany({ ...company, [t.key]: Boolean(checked) })}
            />
            {t.label}
          </label>
        ))}
        <p className="text-xs text-muted-foreground">Customer-facing portal pages are not included in this MVP.</p>
      </div>
    </ContentArea>
  );
}
