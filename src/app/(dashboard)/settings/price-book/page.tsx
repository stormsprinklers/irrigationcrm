"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type Settings = {
  flatRatePricingEnabled: boolean;
  materialMarkupsEnabled: boolean;
};

export default function PriceBookSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/price-book")
      .then((r) => r.json())
      .then((data: Settings) =>
        setSettings({
          flatRatePricingEnabled: Boolean(data.flatRatePricingEnabled),
          materialMarkupsEnabled: Boolean(data.materialMarkupsEnabled),
        })
      )
      .catch(() => toast.error("Failed to load settings"));
  }, []);

  async function save() {
    if (!settings) return;
    setSaving(true);
    const res = await fetch("/api/settings/price-book", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flatRatePricingEnabled: settings.flatRatePricingEnabled,
        materialMarkupsEnabled: settings.materialMarkupsEnabled,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error("Failed to save");
      return;
    }
    const data = await res.json();
    setSettings({
      flatRatePricingEnabled: Boolean(data.flatRatePricingEnabled),
      materialMarkupsEnabled: Boolean(data.materialMarkupsEnabled),
    });
    toast.success("Price book settings saved");
  }

  if (!settings) {
    return (
      <ContentArea>
        <PageHeader breadcrumb={["Settings", "Price Book"]} title="Price Book" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </ContentArea>
    );
  }

  return (
    <ContentArea className="max-w-2xl">
      <PageHeader
        breadcrumb={["Settings", "Price Book"]}
        title="Flat Rate Pricing"
        subtitle="Build service prices from labor rates and material costs. Customers always see a single flat rate — never a parts and labor breakdown."
      />

      <section className="rounded-lg border border-border bg-white p-6">
        <h3 className="mb-4 text-lg font-semibold">Pricing mode</h3>
        <div className="space-y-3">
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={settings.flatRatePricingEnabled}
              onCheckedChange={(c) =>
                setSettings({ ...settings, flatRatePricingEnabled: Boolean(c) })
              }
            />
            <span>
              Enable flat rate pricing
              <span className="mt-0.5 block text-muted-foreground">
                Use labor hours and bundled materials to calculate a service&apos;s sell price in the
                price book. Invoices, estimates, visits, and the customer portal show only the flat
                rate.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={settings.materialMarkupsEnabled}
              onCheckedChange={(c) =>
                setSettings({ ...settings, materialMarkupsEnabled: Boolean(c) })
              }
            />
            <span>
              Apply tiered material markups from cost
              <span className="mt-0.5 block text-muted-foreground">
                When calculating service prices, mark up linked material costs using your markup
                tiers.
              </span>
            </span>
          </label>
        </div>
        <Button className="mt-4" size="sm" onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </section>
    </ContentArea>
  );
}
