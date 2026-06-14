"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

type PreviewRow = {
  id: string;
  name: string;
  type: string;
  beforePrice: number;
  afterPrice: number;
};

export default function BulkAdjustSettingsPage() {
  const [percent, setPercent] = useState("10");
  const [scope, setScope] = useState<"ALL" | "SERVICES" | "MATERIALS">("ALL");
  const [adjustCost, setAdjustCost] = useState(false);
  const [preview, setPreview] = useState<{ count: number; preview: PreviewRow[] } | null>(null);
  const [loading, setLoading] = useState(false);

  async function runAdjust(dryRun: boolean) {
    setLoading(true);
    const res = await fetch("/api/settings/price-book/bulk-adjust", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        percent: Number(percent),
        scope,
        adjustCost,
        dryRun,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      toast.error("Request failed");
      return;
    }
    const data = await res.json();
    if (dryRun) {
      setPreview(data);
      toast.success(`Preview: ${data.count} items affected`);
    } else {
      toast.success(`Updated ${data.count} items`);
      setPreview(null);
    }
  }

  return (
    <ContentArea className="max-w-3xl">
      <PageHeader
        breadcrumb={["Settings", "Price Book", "Bulk adjust"]}
        title="Bulk price adjust"
        subtitle="Raise or lower catalog prices by percentage"
      />

      <div className="space-y-4 rounded-lg border border-border bg-white p-6">
        <div>
          <label className="mb-1 block text-sm font-medium">Percent change</label>
          <Input
            type="number"
            step="0.1"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            placeholder="10 for +10%, -5 for -5%"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Scope</label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={scope}
            onChange={(e) => setScope(e.target.value as typeof scope)}
          >
            <option value="ALL">All items</option>
            <option value="SERVICES">Services only</option>
            <option value="MATERIALS">Materials only</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={adjustCost} onCheckedChange={(c) => setAdjustCost(Boolean(c))} />
          Also adjust unit costs
        </label>
        <div className="flex gap-2">
          <Button variant="outline" disabled={loading} onClick={() => void runAdjust(true)}>
            Preview
          </Button>
          <Button disabled={loading} onClick={() => void runAdjust(false)}>
            Apply
          </Button>
        </div>
      </div>

      {preview && (
        <div className="mt-6 rounded-lg border border-border bg-white p-4">
          <p className="mb-3 text-sm font-medium">{preview.count} items will be updated</p>
          <ul className="space-y-2 text-sm">
            {preview.preview.map((row) => (
              <li key={row.id} className="flex justify-between gap-4">
                <span>
                  {row.name} ({row.type})
                </span>
                <span className="text-muted-foreground">
                  ${row.beforePrice.toFixed(2)} → ${row.afterPrice.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ContentArea>
  );
}
