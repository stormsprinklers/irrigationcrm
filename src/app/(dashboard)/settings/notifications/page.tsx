"use client";

import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useCompanySettings } from "@/components/settings/useCompanySettings";

export default function SettingsNotificationsPage() {
  const { company, setCompany, loading, saving, save } = useCompanySettings();

  if (loading || !company) {
    return (
      <ContentArea className="max-w-2xl">
        <PageHeader breadcrumb={["Settings", "Notifications"]} title="Notifications" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </ContentArea>
    );
  }

  const toggles = [
    { key: "notifyEstimateSent" as const, label: "Estimate sent to customer" },
    { key: "notifyInvoicePaid" as const, label: "Invoice paid" },
    { key: "notifyVisitScheduled" as const, label: "Visit scheduled" },
  ];

  return (
    <ContentArea className="max-w-2xl">
      <PageHeader
        breadcrumb={["Settings", "Notifications"]}
        title="Notifications"
        actions={<Button size="sm" onClick={() => save(company)} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>}
      />
      <div className="space-y-4 rounded-lg border border-border bg-white p-6">
        {toggles.map((t) => (
          <label key={t.key} className="flex items-center gap-3 text-sm">
            <Checkbox
              checked={company[t.key]}
              onCheckedChange={(checked) => setCompany({ ...company, [t.key]: Boolean(checked) })}
            />
            {t.label}
          </label>
        ))}
      </div>
    </ContentArea>
  );
}
