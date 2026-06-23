"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

type Zone = {
  stationNumber: number;
  name: string;
  wateringGuide: string;
  runMinutes: string;
};

type Props = {
  customerId: string;
  propertyId: string;
};

export function PropertyIrrigationEditor({ customerId, propertyId }: Props) {
  const [diagramUrl, setDiagramUrl] = useState("");
  const [zones, setZones] = useState<Zone[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/customers/${customerId}/properties/${propertyId}/irrigation`)
      .then((r) => r.json())
      .then((data) => {
        setDiagramUrl(data.propertyDiagramUrl ?? "");
        setZones(
          (data.zones ?? []).map((z: Zone & { runMinutes: number | null }) => ({
            stationNumber: z.stationNumber,
            name: z.name,
            wateringGuide: z.wateringGuide ?? "",
            runMinutes: z.runMinutes != null ? String(z.runMinutes) : "",
          }))
        );
      });
  }, [customerId, propertyId]);

  function addZone() {
    setZones((prev) => [
      ...prev,
      {
        stationNumber: prev.length + 1,
        name: `Station ${prev.length + 1}`,
        wateringGuide: "",
        runMinutes: "",
      },
    ]);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/properties/${propertyId}/irrigation`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyDiagramUrl: diagramUrl || null,
          zones: zones.map((z) => ({
            stationNumber: z.stationNumber,
            name: z.name,
            wateringGuide: z.wateringGuide || null,
            runMinutes: z.runMinutes ? Number(z.runMinutes) : null,
          })),
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success("Irrigation guide saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Irrigation map & watering guide</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium">Property diagram URL</label>
          <Input
            className="mt-1"
            value={diagramUrl}
            onChange={(e) => setDiagramUrl(e.target.value)}
            placeholder="https://..."
          />
        </div>
        {zones.map((zone, i) => (
          <div key={i} className="rounded border p-3 space-y-2">
            <Input
              value={zone.name}
              onChange={(e) => {
                const next = [...zones];
                next[i] = { ...next[i], name: e.target.value };
                setZones(next);
              }}
              placeholder="Zone name"
            />
            <Input
              value={zone.runMinutes}
              onChange={(e) => {
                const next = [...zones];
                next[i] = { ...next[i], runMinutes: e.target.value };
                setZones(next);
              }}
              placeholder="Run minutes"
            />
            <textarea
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
              rows={3}
              value={zone.wateringGuide}
              onChange={(e) => {
                const next = [...zones];
                next[i] = { ...next[i], wateringGuide: e.target.value };
                setZones(next);
              }}
              placeholder="Watering instructions for customers..."
            />
          </div>
        ))}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={addZone}>
            Add station
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving..." : "Save irrigation guide"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
