"use client";

import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useCompanySettings } from "@/components/settings/useCompanySettings";
import { toast } from "sonner";

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

  const portalSlug = company.portalSlug ?? company.bookingSlug ?? "";
  const appUrl = typeof window !== "undefined" ? window.location.origin : "";
  const portalUrl = portalSlug ? `${appUrl}/portal/${portalSlug}` : "";

  const toggles = [
    { key: "portalShowJobs" as const, label: "Show visits / jobs" },
    { key: "portalShowEstimates" as const, label: "Show estimates" },
    { key: "portalShowInvoices" as const, label: "Show invoices" },
    { key: "portalShowMaintenance" as const, label: "Show maintenance plans" },
    { key: "portalShowChecklists" as const, label: "Show completed checklists" },
    { key: "portalShowRachio" as const, label: "Show Rachio smart irrigation" },
    { key: "portalShowOffers" as const, label: "Show offers & rebates" },
    { key: "portalAllowSchedule" as const, label: "Allow customers to schedule visits" },
    { key: "portalRachioAllowRun" as const, label: "Allow customers to manually run Rachio zones" },
  ];

  return (
    <ContentArea className="max-w-2xl">
      <PageHeader
        breadcrumb={["Settings", "Customer Portal"]}
        title="Customer Portal"
        actions={
          <Button size="sm" onClick={() => save(company)} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        }
      />
      <div className="space-y-6">
        <div className="space-y-4 rounded-lg border border-border bg-white p-6">
          <label className="flex items-center gap-3 text-sm">
            <Checkbox
              checked={company.portalEnabled}
              onCheckedChange={(checked) => setCompany({ ...company, portalEnabled: Boolean(checked) })}
            />
            Enable customer portal
          </label>

          <div>
            <label className="text-sm font-medium">Portal URL slug (optional)</label>
            <p className="text-xs text-muted-foreground mb-1">
              Leave blank to use your booking slug ({company.bookingSlug ?? "set in Booking settings"})
            </p>
            <Input
              value={company.portalSlug ?? ""}
              onChange={(e) => setCompany({ ...company, portalSlug: e.target.value || null })}
              placeholder={company.bookingSlug ?? "your-company"}
            />
          </div>

          {portalUrl && company.portalEnabled ? (
            <div className="rounded-md bg-muted p-3 text-sm">
              <p className="font-medium">Portal URL</p>
              <p className="mt-1 break-all text-primary">{portalUrl}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => {
                  void navigator.clipboard.writeText(portalUrl);
                  toast.success("Copied portal URL");
                }}
              >
                Copy link
              </Button>
            </div>
          ) : null}

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

        <div className="space-y-4 rounded-lg border border-border bg-white p-6">
          <h2 className="font-medium">Scheduling policies</h2>
          <div>
            <label className="text-sm font-medium">Reschedule lead time (hours)</label>
            <Input
              type="number"
              min={0}
              className="mt-1 max-w-xs"
              value={company.portalRescheduleLeadHours}
              onChange={(e) =>
                setCompany({ ...company, portalRescheduleLeadHours: Number(e.target.value) || 0 })
              }
            />
          </div>
          <div>
            <label className="text-sm font-medium">Cancel lead time (hours)</label>
            <Input
              type="number"
              min={0}
              className="mt-1 max-w-xs"
              value={company.portalCancelLeadHours}
              onChange={(e) =>
                setCompany({ ...company, portalCancelLeadHours: Number(e.target.value) || 0 })
              }
            />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-white p-6">
          <h2 className="font-medium">Offers & rebates</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage portal offers customers see on their dashboard.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <a href="/settings/customer-portal/offers">Manage offers</a>
          </Button>
        </div>
      </div>
    </ContentArea>
  );
}
