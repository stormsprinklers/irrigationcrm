"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  IRRIGATION_TYPES,
  SHADE_LEVELS,
  SOIL_TYPES,
  SLOPE_LEVELS,
  VEGETATION_TYPES,
  WIZARD_STEPS,
} from "@/lib/irrigation/constants";
import { calculateZoneSchedule } from "@/lib/irrigation/runtime";
import type {
  IrrigationType,
  ShadeLevel,
  SlopeLevel,
  SoilType,
  VegetationType,
} from "@/lib/irrigation/types";
import { toast } from "sonner";

type MapZone = {
  name: string;
  vegetationType: VegetationType;
  shadeLevel: ShadeLevel;
  slopeLevel: SlopeLevel;
  soilType: SoilType;
  irrigationType: IrrigationType;
  nozzleCount: number;
};

type Props = {
  customerId: string;
  propertyId: string;
};

const defaultZone = (): MapZone => ({
  name: "Zone 1",
  vegetationType: "grass",
  shadeLevel: "full_sun",
  slopeLevel: "flat",
  soilType: "loam",
  irrigationType: "spray",
  nozzleCount: 4,
});

export function PropertyIrrigationWizard({ customerId, propertyId }: Props) {
  const [step, setStep] = useState(1);
  const [address, setAddress] = useState("");
  const [aerialImageUrl, setAerialImageUrl] = useState("");
  const [zones, setZones] = useState<MapZone[]>([defaultZone()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/customers/${customerId}/properties/${propertyId}/irrigation-map`)
      .then((r) => r.json())
      .then((data) => {
        const p = data.property;
        if (!p) return;
        setAddress(p.address ?? "");
        setAerialImageUrl(p.aerialImageUrl ?? "");
        setStep(p.irrigationWizardStep ?? 1);
        if (p.irrigationMapZones?.length) {
          setZones(
            p.irrigationMapZones.map((z: Record<string, string | number | null>, i: number) => ({
              name: String(z.name ?? `Zone ${i + 1}`),
              vegetationType: (z.vegetationType as VegetationType) ?? "grass",
              shadeLevel: (z.shadeLevel as ShadeLevel) ?? "full_sun",
              slopeLevel: (z.slopeLevel as SlopeLevel) ?? "flat",
              soilType: (z.soilType as SoilType) ?? "loam",
              irrigationType: (z.irrigationType as IrrigationType) ?? "spray",
              nozzleCount: Number(z.nozzleCount ?? 4),
            }))
          );
        }
      })
      .catch(() => {});
  }, [customerId, propertyId]);

  async function save(publish = false) {
    setSaving(true);
    try {
      const mapZones = zones.map((z) => {
        const schedule = calculateZoneSchedule({
          vegetationType: z.vegetationType,
          irrigationType: z.irrigationType,
          shadeLevel: z.shadeLevel,
          soilType: z.soilType,
          slopeLevel: z.slopeLevel,
        });
        return {
          name: z.name,
          polygonGeoJson: { type: "Polygon", coordinates: [] },
          vegetationType: z.vegetationType,
          shadeLevel: z.shadeLevel,
          slopeLevel: z.slopeLevel,
          soilType: z.soilType,
          irrigationType: z.irrigationType,
          nozzleCount: z.nozzleCount,
          estimatedGpm: Math.round(z.nozzleCount * 0.5 * 100) / 100,
          baseRuntimeMinutes: schedule.adjustedRuntimeMinutes,
        };
      });

      const res = await fetch(
        `/api/customers/${customerId}/properties/${propertyId}/irrigation-map`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            property: { aerialImageUrl, irrigationWizardStep: step },
            mapZones,
            publish,
          }),
        }
      );
      if (!res.ok) throw new Error();
      toast.success(publish ? "Irrigation guide published" : "Draft saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const currentStep = WIZARD_STEPS.find((s) => s.step === step) ?? WIZARD_STEPS[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Irrigation wizard — {currentStep.title}</CardTitle>
        <p className="text-sm text-muted-foreground">{currentStep.description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === 1 && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Property address</label>
            <Input value={address} readOnly className="bg-muted" />
            <label className="text-sm font-medium">Aerial / diagram image URL</label>
            <Input
              value={aerialImageUrl}
              onChange={(e) => setAerialImageUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
        )}

        {(step === 2 || step === 3) &&
          zones.map((zone, i) => (
            <div key={i} className="rounded border p-3 space-y-2">
              <Input
                value={zone.name}
                onChange={(e) => {
                  const next = [...zones];
                  next[i] = { ...next[i], name: e.target.value };
                  setZones(next);
                }}
              />
              {step === 2 && (
                <select
                  className="w-full rounded border px-2 py-1 text-sm"
                  value={zone.vegetationType}
                  onChange={(e) => {
                    const next = [...zones];
                    next[i] = { ...next[i], vegetationType: e.target.value as VegetationType };
                    setZones(next);
                  }}
                >
                  {VEGETATION_TYPES.map((v) => (
                    <option key={v.value} value={v.value}>{v.label}</option>
                  ))}
                </select>
              )}
              {step === 3 && (
                <>
                  <select
                    className="w-full rounded border px-2 py-1 text-sm"
                    value={zone.irrigationType}
                    onChange={(e) => {
                      const next = [...zones];
                      next[i] = { ...next[i], irrigationType: e.target.value as IrrigationType };
                      setZones(next);
                    }}
                  >
                    {IRRIGATION_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    min={1}
                    value={zone.nozzleCount}
                    onChange={(e) => {
                      const next = [...zones];
                      next[i] = { ...next[i], nozzleCount: Number(e.target.value) };
                      setZones(next);
                    }}
                    placeholder="Nozzle count"
                  />
                </>
              )}
            </div>
          ))}

        {step === 5 && (
          <ul className="space-y-2 text-sm">
            {zones.map((z) => {
              const schedule = calculateZoneSchedule({
                vegetationType: z.vegetationType,
                irrigationType: z.irrigationType,
                shadeLevel: z.shadeLevel,
                soilType: z.soilType,
                slopeLevel: z.slopeLevel,
              });
              return (
                <li key={z.name} className="rounded border p-2">
                  <strong>{z.name}</strong> — {schedule.adjustedRuntimeMinutes} min,{" "}
                  {schedule.daysLabel}
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-wrap gap-2">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
          )}
          {step < 5 ? (
            <Button onClick={() => setStep((s) => s + 1)}>Next</Button>
          ) : (
            <Button onClick={() => save(true)} disabled={saving}>
              {saving ? "Publishing..." : "Publish to portal"}
            </Button>
          )}
          <Button variant="secondary" onClick={() => save(false)} disabled={saving}>
            Save draft
          </Button>
          {step === 2 && (
            <Button variant="outline" onClick={() => setZones((z) => [...z, defaultZone()])}>
              Add zone
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
