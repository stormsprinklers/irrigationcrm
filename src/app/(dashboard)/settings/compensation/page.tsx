"use client";

import { useEffect, useState } from "react";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type CompensationSettings = {
  commissionBasis: string;
  payPeriodType: string;
  payPeriodAnchorDate: string | null;
};

const COMMISSION_BASIS_OPTIONS = [
  {
    value: "COMPLETED_JOB_REVENUE",
    label: "Completed job revenue",
    description: "Commission based on visit totals after discounts.",
  },
  {
    value: "COLLECTED_INVOICE",
    label: "Collected invoice",
    description: "Commission based on payments received on job invoices.",
  },
  {
    value: "GROSS_PROFIT",
    label: "Gross profit",
    description: "Revenue minus line-item costs (materials and bundled labor).",
  },
  {
    value: "LABOR_ONLY",
    label: "Labor only",
    description: "Commission on labor portion of line items only (no materials).",
  },
];

const PAY_PERIOD_OPTIONS = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "BIWEEKLY", label: "Biweekly" },
  { value: "MONTHLY", label: "Monthly" },
];

export default function SettingsCompensationPage() {
  const [settings, setSettings] = useState<CompensationSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/compensation")
      .then((r) => r.json())
      .then(setSettings)
      .catch(() => toast.error("Failed to load compensation settings"));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/compensation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        toast.error("Failed to save settings");
        return;
      }
      setSettings(await res.json());
      toast.success("Compensation settings saved");
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return (
      <ContentArea className="max-w-2xl">
        <PageHeader breadcrumb={["Settings", "Compensation"]} title="Compensation" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </ContentArea>
    );
  }

  return (
    <ContentArea className="max-w-2xl">
      <PageHeader
        breadcrumb={["Settings", "Compensation"]}
        title="Compensation"
        subtitle="Company-wide commission basis and pay period settings"
      />

      <form onSubmit={handleSave} className="space-y-6">
        <section className="rounded-lg border border-border bg-white p-4">
          <h3 className="mb-4 text-lg font-semibold">Commission basis</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Applies to employees on commission or hybrid pay. Individual rates are set per employee.
          </p>
          <div className="space-y-3">
            {COMMISSION_BASIS_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer gap-3 rounded-md border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
              >
                <input
                  type="radio"
                  name="commissionBasis"
                  value={option.value}
                  checked={settings.commissionBasis === option.value}
                  onChange={() =>
                    setSettings({ ...settings, commissionBasis: option.value })
                  }
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="text-sm text-muted-foreground">{option.description}</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-white p-4">
          <h3 className="mb-4 text-lg font-semibold">Pay period</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Period type</label>
              <select
                className="w-full rounded-md border border-border px-3 py-2 text-sm"
                value={settings.payPeriodType}
                onChange={(e) =>
                  setSettings({ ...settings, payPeriodType: e.target.value })
                }
              >
                {PAY_PERIOD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Biweekly anchor date</label>
              <Input
                type="date"
                value={
                  settings.payPeriodAnchorDate
                    ? settings.payPeriodAnchorDate.slice(0, 10)
                    : ""
                }
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    payPeriodAnchorDate: e.target.value || null,
                  })
                }
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Used to align biweekly pay periods. Ignored for weekly/monthly.
              </p>
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
