"use client";

import { useEffect, useState } from "react";
import { PropertyIrrigationMapEditor } from "@/components/visits/PropertyIrrigationMapEditor";

type RuntimeZone = {
  name: string;
  runMinutes: number | null;
  wateringGuide: string | null;
};

type Props = {
  customerId: string;
  propertyId: string;
  propertyName: string;
  aerialImageUrl?: string | null;
  propertyDiagramUrl?: string | null;
  irrigationMapStatus?: string | null;
};

export function VisitIrrigationSection({
  customerId,
  propertyId,
  propertyName,
  aerialImageUrl,
  propertyDiagramUrl,
  irrigationMapStatus,
}: Props) {
  const [zones, setZones] = useState<RuntimeZone[]>([]);
  const [loadingRuntimes, setLoadingRuntimes] = useState(true);

  useEffect(() => {
    setLoadingRuntimes(true);
    fetch(`/api/customers/${customerId}/properties/${propertyId}/irrigation`)
      .then((r) => (r.ok ? r.json() : { zones: [] }))
      .then((data) => setZones(data.zones ?? []))
      .catch(() => setZones([]))
      .finally(() => setLoadingRuntimes(false));
  }, [customerId, propertyId]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <PropertyIrrigationMapEditor
        customerId={customerId}
        propertyId={propertyId}
        propertyName={propertyName}
        aerialImageUrl={aerialImageUrl}
        propertyDiagramUrl={propertyDiagramUrl}
        irrigationMapStatus={irrigationMapStatus}
        allowInlineEdit
      />
      <section className="rounded-lg border border-border bg-white">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Runtime suggestions</h2>
          <p className="text-xs text-muted-foreground">Based on zone conditions and published guide</p>
        </div>
        <div className="max-h-[32rem] overflow-y-auto p-4">
          {loadingRuntimes ? (
            <p className="text-sm text-muted-foreground">Loading runtimes...</p>
          ) : zones.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No published runtime guide yet. Save and publish the irrigation map to generate
              suggestions.
            </p>
          ) : (
            <ul className="space-y-3">
              {zones.map((zone) => (
                <li key={zone.name} className="rounded-md border px-3 py-2 text-sm">
                  <p className="font-medium">{zone.name}</p>
                  <p className="mt-0.5 text-muted-foreground">
                    {zone.runMinutes != null ? `${zone.runMinutes} min` : "—"}
                    {zone.wateringGuide ? ` · ${zone.wateringGuide}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
