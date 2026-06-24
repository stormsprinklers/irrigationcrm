"use client";

import Link from "next/link";
import { Calendar, ExternalLink } from "lucide-react";
import { DesignZoneViewer } from "@/components/design/DesignZoneViewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { toast } from "sonner";

type BomLine = {
  description?: string;
  quantity?: number;
  unit?: string;
  unitCost?: number;
  category?: string;
};

type Props = {
  estimateId: string;
  designProjectId: string | null;
  designVersionId: string | null;
  designExportMetadata: Record<string, unknown> | null;
  designInternalBom: BomLine[] | null;
  estimatedManHours: number | null;
  installDurationDays: number | null;
  needsScheduling: boolean;
  premiumOptionTotal: number | null;
  onUpdated: () => void;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function EstimateDesignSection({
  estimateId,
  designProjectId,
  designExportMetadata,
  designInternalBom,
  estimatedManHours,
  installDurationDays,
  needsScheduling,
  premiumOptionTotal,
  onUpdated,
}: Props) {
  const [durationDays, setDurationDays] = useState(String(installDurationDays ?? 4));
  const [saving, setSaving] = useState(false);

  if (!designProjectId) return null;

  const designAppUrl = process.env.NEXT_PUBLIC_DESIGN_URL?.replace(/\/$/, "");
  const snapshot = designExportMetadata?.designSnapshot as Record<string, unknown> | undefined;
  const bom = designInternalBom ?? [];

  async function saveDuration() {
    const days = Number(durationDays);
    if (!Number.isFinite(days) || days < 1 || days > 30) {
      toast.error("Install duration must be between 1 and 30 days");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/estimates/${estimateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installDurationDays: days }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Install duration updated");
      onUpdated();
    } catch {
      toast.error("Failed to update install duration");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">Design estimate</CardTitle>
        {needsScheduling ? <Badge variant="destructive">Needs scheduling</Badge> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {needsScheduling ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
            <span className="flex items-center gap-2 text-amber-900">
              <Calendar className="h-4 w-4" />
              Deposit paid — schedule the install visit
            </span>
            <Button size="sm" asChild>
              <Link href="/schedule/needs-scheduling">Open queue</Link>
            </Button>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3 text-sm">
          {estimatedManHours != null ? (
            <span className="text-muted-foreground">{estimatedManHours} est. man-hours</span>
          ) : null}
          {premiumOptionTotal != null ? (
            <span className="text-muted-foreground">
              Premium option: {formatCurrency(premiumOptionTotal)}
            </span>
          ) : null}
          {designAppUrl ? (
            <a
              href={`${designAppUrl}/projects/${designProjectId}/design`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Open in design app
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="install-days" className="text-sm font-medium">
              Install duration (days)
            </label>
            <Input
              id="install-days"
              type="number"
              min={1}
              max={30}
              className="w-24"
              value={durationDays}
              onChange={(e) => setDurationDays(e.target.value)}
            />
          </div>
          <Button size="sm" variant="outline" onClick={saveDuration} disabled={saving}>
            Save
          </Button>
        </div>

        {snapshot ? <DesignZoneViewer snapshot={snapshot as never} showPartsCounts /> : null}

        {bom.length > 0 ? (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Internal BOM (staff only)</h4>
            <div className="max-h-64 overflow-auto rounded-md border text-xs">
              <table className="w-full">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="px-2 py-1 text-left">Item</th>
                    <th className="px-2 py-1 text-right">Qty</th>
                    <th className="px-2 py-1 text-right">Unit cost</th>
                  </tr>
                </thead>
                <tbody>
                  {bom.map((line, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1">{line.description ?? line.category ?? "—"}</td>
                      <td className="px-2 py-1 text-right">{line.quantity ?? "—"}</td>
                      <td className="px-2 py-1 text-right">
                        {line.unitCost != null ? formatCurrency(line.unitCost) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
