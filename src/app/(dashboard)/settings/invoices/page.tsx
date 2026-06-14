"use client";

import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCompanySettings } from "@/components/settings/useCompanySettings";

export default function SettingsInvoicesPage() {
  const { company, setCompany, loading, saving, save } = useCompanySettings();

  if (loading || !company) {
    return (
      <ContentArea className="max-w-2xl">
        <PageHeader breadcrumb={["Settings", "Invoices"]} title="Invoices" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </ContentArea>
    );
  }

  return (
    <ContentArea className="max-w-2xl">
      <PageHeader
        breadcrumb={["Settings", "Invoices"]}
        title="Invoices"
        actions={<Button size="sm" onClick={() => save(company)} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>}
      />
      <div className="space-y-4 rounded-lg border border-border bg-white p-6">
        <div>
          <label className="text-sm text-muted-foreground">Invoice prefix</label>
          <Input
            className="mt-1 max-w-[160px]"
            value={company.invoicePrefix ?? ""}
            onChange={(e) => setCompany({ ...company, invoicePrefix: e.target.value })}
          />
        </div>
        <div>
          <label className="text-sm text-muted-foreground">Payment terms</label>
          <textarea
            className="mt-1 flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={company.invoiceTerms ?? ""}
            onChange={(e) => setCompany({ ...company, invoiceTerms: e.target.value })}
          />
        </div>
        <div>
          <label className="text-sm text-muted-foreground">Invoice footer</label>
          <textarea
            className="mt-1 flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={company.invoiceFooter ?? ""}
            onChange={(e) => setCompany({ ...company, invoiceFooter: e.target.value })}
          />
        </div>
      </div>
    </ContentArea>
  );
}
