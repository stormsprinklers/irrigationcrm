"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Tier = {
  minCost: string;
  maxCost: string;
  markupPercent: string;
};

const DEFAULT_TIERS: Tier[] = [
  { minCost: "0.01", maxCost: "50", markupPercent: "150" },
  { minCost: "50.01", maxCost: "100", markupPercent: "100" },
  { minCost: "100.01", maxCost: "500", markupPercent: "75" },
  { minCost: "500.01", maxCost: "", markupPercent: "50" },
];

export default function MaterialMarkupsSettingsPage() {
  const [tiers, setTiers] = useState<Tier[]>(DEFAULT_TIERS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/price-book/material-markups")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length) {
          setTiers(
            data.map((t: { minCost: number; maxCost: number | null; markupPercent: number }) => ({
              minCost: String(t.minCost),
              maxCost: t.maxCost != null ? String(t.maxCost) : "",
              markupPercent: String(t.markupPercent),
            }))
          );
        }
      })
      .catch(() => {});
  }, []);

  function updateTier(index: number, field: keyof Tier, value: string) {
    setTiers((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  }

  function addTier() {
    setTiers((prev) => [...prev, { minCost: "0", maxCost: "", markupPercent: "100" }]);
  }

  async function save() {
    setSaving(true);
    const res = await fetch("/api/settings/price-book/material-markups", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tiers: tiers.map((t) => ({
          minCost: Number(t.minCost),
          maxCost: t.maxCost ? Number(t.maxCost) : null,
          markupPercent: Number(t.markupPercent),
        })),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error("Failed to save markups");
      return;
    }
    toast.success("Material markups saved");
  }

  return (
    <ContentArea className="max-w-3xl">
      <PageHeader
        breadcrumb={["Settings", "Price Book", "Material markups"]}
        title="Material markups"
        subtitle="Tiered markup on cost (e.g. 150% markup on $10 cost → $25 sell price)"
      />

      <div className="mb-4 space-y-3 rounded-lg border border-border bg-white p-6">
        <div className="hidden gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid sm:grid-cols-4">
          <span>Min cost ($)</span>
          <span>Max cost ($)</span>
          <span>Markup %</span>
          <span className="sr-only">Notes</span>
        </div>
        {tiers.map((tier, index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground sm:hidden">Min cost ($)</label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.01"
                aria-label="Min cost"
                value={tier.minCost}
                onChange={(e) => updateTier(index, "minCost", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground sm:hidden">
                Max cost ($)
              </label>
              <Input
                type="number"
                step="0.01"
                placeholder="Blank = no max"
                aria-label="Max cost"
                value={tier.maxCost}
                onChange={(e) => updateTier(index, "maxCost", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground sm:hidden">Markup %</label>
              <Input
                type="number"
                step="0.01"
                placeholder="100"
                aria-label="Markup percent"
                value={tier.markupPercent}
                onChange={(e) => updateTier(index, "markupPercent", e.target.value)}
              />
            </div>
            <p className="flex items-center text-sm text-muted-foreground">% on cost</p>
          </div>
        ))}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={addTier}>
            Add tier
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save tiers"}
          </Button>
        </div>
      </div>
    </ContentArea>
  );
}
