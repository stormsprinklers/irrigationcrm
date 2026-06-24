"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { DesignZoneViewer } from "@/components/design/DesignZoneViewer";

type Props = {
  designExportMetadata: Record<string, unknown> | null;
  estimatedManHours?: number | null;
  installDurationDays?: number | null;
  visitId?: string;
  onDurationUpdated?: () => void;
};

export function VisitInstallPlanSection({
  designExportMetadata,
  estimatedManHours,
  installDurationDays,
  visitId,
  onDurationUpdated,
}: Props) {
  const [durationDays, setDurationDays] = useState(String(installDurationDays ?? 4));
  const [saving, setSaving] = useState(false);
  const snapshot = (designExportMetadata?.designSnapshot ?? null) as Record<string, unknown> | null;
  if (!snapshot) {
    return (
      <section className="rounded-lg border p-4">
        <h3 className="font-medium">Install plan</h3>
        <p className="mt-1 text-sm text-muted-foreground">No design linked to this visit.</p>
      </section>
    );
  }

  async function saveDuration() {
    if (!visitId) return;
    const days = Number(durationDays);
    if (!Number.isFinite(days) || days < 1 || days > 30) {
      toast.error("Install duration must be between 1 and 30 days");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/visits/${visitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installDurationDays: days }),
      });
      if (!res.ok) throw new Error();
      toast.success("Install duration updated");
      onDurationUpdated?.();
    } catch {
      toast.error("Failed to update install duration");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">Install plan</h3>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {estimatedManHours != null ? <span>{estimatedManHours} est. hours</span> : null}
          {visitId ? (
            <div className="flex items-end gap-2">
              <div className="space-y-0.5">
                <label htmlFor="visit-install-days" className="text-xs font-medium">
                  Install days
                </label>
                <Input
                  id="visit-install-days"
                  type="number"
                  min={1}
                  max={30}
                  className="h-8 w-16 text-xs"
                  value={durationDays}
                  onChange={(e) => setDurationDays(e.target.value)}
                />
              </div>
              <Button type="button" size="sm" variant="outline" className="h-8" onClick={saveDuration} disabled={saving}>
                Save
              </Button>
            </div>
          ) : installDurationDays != null ? (
            <span>{installDurationDays}-day install</span>
          ) : null}
        </div>
      </div>
      <DesignZoneViewer snapshot={snapshot as never} showPartsCounts />
    </section>
  );
}
