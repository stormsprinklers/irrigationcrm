"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type Settings = {
  flatRatePricingEnabled: boolean;
  materialMarkupsEnabled: boolean;
  openaiConfigured: boolean;
  laborRateCount: number;
  markupTierCount: number;
};

export default function PriceBookSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/price-book")
      .then((r) => r.json())
      .then(setSettings)
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
    setSettings(await res.json());
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
        title="Flat rate pricing"
        subtitle="Housecall Pro-style labor rates, material markups, and calculated service prices"
      />

      <section className="mb-6 rounded-lg border border-border bg-white p-6">
        <h3 className="mb-4 text-lg font-semibold">Pricing mode</h3>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={settings.flatRatePricingEnabled}
              onCheckedChange={(c) =>
                setSettings({ ...settings, flatRatePricingEnabled: Boolean(c) })
              }
            />
            Enable flat rate pricing (labor + materials breakdown on services)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={settings.materialMarkupsEnabled}
              onCheckedChange={(c) =>
                setSettings({ ...settings, materialMarkupsEnabled: Boolean(c) })
              }
            />
            Apply tiered material markups from cost
          </label>
        </div>
        <Button className="mt-4" size="sm" onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </section>

      <section className="mb-6 rounded-lg border border-border bg-white p-6">
        <h3 className="mb-2 text-lg font-semibold">Configuration</h3>
        <ul className="space-y-1 text-sm">
          <li>
            <Link href="/settings/price-book/labor-rates" className="text-primary underline">
              {settings.laborRateCount} labor rates
            </Link>
          </li>
          <li>
            <Link href="/settings/price-book/material-markups" className="text-primary underline">
              {settings.markupTierCount} markup tiers
            </Link>
          </li>
          <li>
            <Link href="/settings/price-book/bulk-adjust" className="text-primary underline">
              Bulk price adjust
            </Link>
          </li>
        </ul>
      </section>

      <section className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
        <p className="font-medium">OpenAI (descriptions &amp; images)</p>
        <p className="mt-1 text-muted-foreground">
          {settings.openaiConfigured
            ? "OPENAI_API_KEY is configured on the server."
            : "Set OPENAI_API_KEY in .env.local to enable AI description and image generation on price book items."}
        </p>
      </section>
    </ContentArea>
  );
}
