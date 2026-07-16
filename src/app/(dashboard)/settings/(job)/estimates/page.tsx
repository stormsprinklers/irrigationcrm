"use client";

import { useEffect, useState } from "react";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

type EstimateSettings = {
  estimateExpiryDays: number;
  estimateDepositRequired: boolean;
  estimateDepositType: "PERCENT" | "FIXED" | null;
  estimateDepositAmount: string | number | null;
  defaultInstallDurationDays: number;
  supplierEmail: string | null;
  supplierPartsAutoSend: boolean;
};

export default function SettingsEstimatesPage() {
  const [settings, setSettings] = useState<EstimateSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/estimates")
      .then((r) => r.json())
      .then(setSettings)
      .catch(() => toast.error("Failed to load estimate settings"));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/estimates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        toast.error("Failed to save settings");
        return;
      }
      setSettings(await res.json());
      toast.success("Estimate settings saved");
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return (
      <ContentArea className="max-w-2xl">
        <PageHeader breadcrumb={["Settings", "Estimates"]} title="Estimates" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </ContentArea>
    );
  }

  return (
    <ContentArea className="max-w-2xl">
      <PageHeader
        breadcrumb={["Settings", "Estimates"]}
        title="Estimates"
        subtitle="Default expiry and deposit settings for new estimates"
      />

      <form onSubmit={handleSave} className="space-y-6">
        <section className="rounded-lg border border-border bg-white p-4">
          <h3 className="mb-4 text-lg font-semibold">Defaults</h3>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Estimate expiry (days)</label>
              <Input
                type="number"
                min={1}
                value={settings.estimateExpiryDays}
                onChange={(e) =>
                  setSettings({ ...settings, estimateExpiryDays: Number(e.target.value) })
                }
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={settings.estimateDepositRequired}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, estimateDepositRequired: Boolean(checked) })
                }
              />
              <label className="text-sm">Require deposit on estimates</label>
            </div>
            {settings.estimateDepositRequired && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">Deposit type</label>
                  <select
                    value={settings.estimateDepositType ?? "FIXED"}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        estimateDepositType: e.target.value as "PERCENT" | "FIXED",
                      })
                    }
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  >
                    <option value="FIXED">Fixed amount</option>
                    <option value="PERCENT">Percentage</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Deposit amount</label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={settings.estimateDepositAmount ?? ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        estimateDepositAmount: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-white p-4">
          <h3 className="mb-4 text-lg font-semibold">Install & supplier</h3>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Default install duration (days)</label>
              <Input
                type="number"
                min={1}
                value={settings.defaultInstallDurationDays ?? 4}
                onChange={(e) =>
                  setSettings({ ...settings, defaultInstallDurationDays: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Supplier email (parts list)</label>
              <Input
                type="email"
                value={settings.supplierEmail ?? ""}
                onChange={(e) => setSettings({ ...settings, supplierEmail: e.target.value || null })}
                placeholder="orders@supplier.com"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={settings.supplierPartsAutoSend ?? false}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, supplierPartsAutoSend: Boolean(checked) })
                }
              />
              <label className="text-sm">Email parts list to supplier when estimate is approved</label>
            </div>
          </div>
        </section>

        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save settings"}
        </Button>
      </form>
    </ContentArea>
  );
}
