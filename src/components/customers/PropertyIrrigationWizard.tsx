"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AerialZoneMapEditor } from "@/components/customers/AerialZoneMapEditor";
import {
  IRRIGATION_TYPES,
  SHADE_LEVELS,
  SLOPE_LEVELS,
  SOIL_TYPES,
  VEGETATION_TYPES,
  WATER_SOURCE_OPTIONS,
  WIZARD_STEPS,
  ZONE_MAP_COLORS,
} from "@/lib/irrigation/constants";
import { calculateZoneSchedule } from "@/lib/irrigation/runtime";
import { polygonFromGeoJson, polygonToGeoJson } from "@/lib/irrigation/image-polygon";
import type { ImagePolygon } from "@/lib/irrigation/image-polygon";
import type {
  IrrigationType,
  ShadeLevel,
  SlopeLevel,
  SoilType,
  VegetationType,
} from "@/lib/irrigation/types";
import { formatAddressQuery } from "@/lib/customers/maps";
import { blobProxyUrl } from "@/lib/blob/urls";
import { toast } from "sonner";

type MapZone = {
  name: string;
  polygon: ImagePolygon | null;
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

function defaultZone(index: number): MapZone {
  return {
    name: `Zone ${index + 1}`,
    polygon: null,
    vegetationType: "grass",
    shadeLevel: "full_sun",
    slopeLevel: "flat",
    soilType: "loam",
    irrigationType: "spray",
    nozzleCount: 4,
  };
}

function zonesForCount(count: number, existing: MapZone[]): MapZone[] {
  const n = Math.max(1, Math.min(24, count));
  return Array.from({ length: n }, (_, i) => {
    const prev = existing[i];
    return prev
      ? { ...prev, name: prev.name || `Zone ${i + 1}` }
      : defaultZone(i);
  });
}

const MAX_STEP = WIZARD_STEPS.length;

export function PropertyIrrigationWizard({ customerId, propertyId }: Props) {
  const [step, setStep] = useState(1);
  const [addressQuery, setAddressQuery] = useState("");
  const [aerialImageUrl, setAerialImageUrl] = useState("");
  const [zoneCount, setZoneCount] = useState(1);
  const [shutoffValveLocation, setShutoffValveLocation] = useState("");
  const [controllerLocation, setControllerLocation] = useState("");
  const [waterSource, setWaterSource] = useState("");
  const [zones, setZones] = useState<MapZone[]>([defaultZone(0)]);
  const [activeZoneIndex, setActiveZoneIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [capturingAerial, setCapturingAerial] = useState(false);
  const [propertyLoaded, setPropertyLoaded] = useState(false);
  const [importingDesign, setImportingDesign] = useState(false);
  const autoCaptureAttempted = useRef(false);

  useEffect(() => {
    fetch(`/api/customers/${customerId}/properties/${propertyId}/irrigation-map`)
      .then((r) => r.json())
      .then((data) => {
        const p = data.property;
        if (!p) return;
        setAddressQuery(
          formatAddressQuery({
            address: p.address,
            city: p.city,
            state: p.state,
            zip: p.zip,
          }) ?? ""
        );
        setAerialImageUrl(p.aerialImageUrl ?? "");
        setZoneCount(p.irrigationZoneCount ?? p.irrigationMapZones?.length ?? 1);
        setShutoffValveLocation(p.shutoffValveLocation ?? "");
        setControllerLocation(p.controllerLocation ?? "");
        setWaterSource(p.waterSource ?? "");
        setStep(Math.min(p.irrigationWizardStep ?? 1, MAX_STEP));

        if (p.irrigationMapZones?.length) {
          const loaded = p.irrigationMapZones.map(
            (z: Record<string, string | number | null | unknown>, i: number) => ({
              name: String(z.name ?? `Zone ${i + 1}`),
              polygon: polygonFromGeoJson(z.polygonGeoJson),
              vegetationType: (z.vegetationType as VegetationType) ?? "grass",
              shadeLevel: (z.shadeLevel as ShadeLevel) ?? "full_sun",
              slopeLevel: (z.slopeLevel as SlopeLevel) ?? "flat",
              soilType: (z.soilType as SoilType) ?? "loam",
              irrigationType: (z.irrigationType as IrrigationType) ?? "spray",
              nozzleCount: Number(z.nozzleCount ?? 4),
            })
          );
          setZones(loaded);
        } else if (p.irrigationZoneCount) {
          setZones(zonesForCount(p.irrigationZoneCount, []));
        }
      })
      .catch(() => {})
      .finally(() => setPropertyLoaded(true));
  }, [customerId, propertyId]);

  const captureAerial = useCallback(async () => {
    if (!addressQuery.trim()) {
      toast.error("Add a property address before capturing an aerial image");
      return;
    }

    setCapturingAerial(true);
    try {
      const res = await fetch(
        `/api/customers/${customerId}/properties/${propertyId}/irrigation-map/aerial`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to capture aerial image");
      }
      setAerialImageUrl(data.aerialImageUrl ?? "");
      toast.success("Aerial image captured from Google Maps");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to capture aerial image");
    } finally {
      setCapturingAerial(false);
    }
  }, [addressQuery, customerId, propertyId]);

  useEffect(() => {
    if (!propertyLoaded || autoCaptureAttempted.current) return;
    if (aerialImageUrl || !addressQuery.trim()) return;
    autoCaptureAttempted.current = true;
    void captureAerial();
  }, [propertyLoaded, aerialImageUrl, addressQuery, captureAerial]);

  async function importFromDesign() {
    setImportingDesign(true);
    try {
      const res = await fetch(
        `/api/customers/${customerId}/properties/${propertyId}/design-seed`
      );
      const data = await res.json();
      if (!data.seed) {
        toast.error(data.reason ?? "No design data to import");
        return;
      }
      const seed = data.seed as {
        zoneCount: number;
        zones: Array<{
          name: string;
          vegetationType: VegetationType;
          shadeLevel: ShadeLevel;
          slopeLevel: SlopeLevel;
          soilType: SoilType;
          irrigationType: IrrigationType;
          nozzleCount: number;
        }>;
        shutoffValveLocation?: string;
        controllerLocation?: string;
      };
      setZoneCount(seed.zoneCount);
      setZones((prev) =>
        seed.zones.map((z, i) => ({
          name: z.name || `Zone ${i + 1}`,
          polygon: prev[i]?.polygon ?? null,
          vegetationType: z.vegetationType,
          shadeLevel: z.shadeLevel,
          slopeLevel: z.slopeLevel,
          soilType: z.soilType,
          irrigationType: z.irrigationType,
          nozzleCount: z.nozzleCount,
        }))
      );
      if (seed.shutoffValveLocation) setShutoffValveLocation(seed.shutoffValveLocation);
      if (seed.controllerLocation) setControllerLocation(seed.controllerLocation);
      toast.success("Imported zone settings from design (draw polygons on aerial next)");
    } catch {
      toast.error("Failed to import from design");
    } finally {
      setImportingDesign(false);
    }
  }

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
          polygonGeoJson: polygonToGeoJson(z.polygon),
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
            property: {
              aerialImageUrl,
              irrigationWizardStep: step,
              irrigationZoneCount: zoneCount,
              shutoffValveLocation: shutoffValveLocation.trim() || null,
              controllerLocation: controllerLocation.trim() || null,
              waterSource: waterSource || null,
            },
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

  function validateStep(): boolean {
    if (step === 1 && !aerialImageUrl) {
      toast.error("Capture an aerial image before continuing");
      return false;
    }
    if (step === 2) {
      if (!zoneCount || zoneCount < 1) {
        toast.error("Enter how many zones are on the property");
        return false;
      }
      if (!shutoffValveLocation.trim()) {
        toast.error("Enter the shutoff valve location");
        return false;
      }
      if (!controllerLocation.trim()) {
        toast.error("Enter the controller location");
        return false;
      }
    }
    if (step === 3) {
      const missing = zones.filter((z) => !z.polygon?.length);
      if (missing.length) {
        toast.error(`Draw polygons for: ${missing.map((z) => z.name).join(", ")}`);
        return false;
      }
    }
    return true;
  }

  function goNext() {
    if (!validateStep()) return;
    setStep((s) => Math.min(s + 1, MAX_STEP));
  }

  const currentStep = WIZARD_STEPS.find((s) => s.step === step) ?? WIZARD_STEPS[0];
  const aerialDisplayUrl = aerialImageUrl
    ? (blobProxyUrl(aerialImageUrl) ?? aerialImageUrl)
    : "";

  const mapZones = zones.map((z, i) => ({
    name: z.name,
    polygon: z.polygon,
    color: ZONE_MAP_COLORS[i % ZONE_MAP_COLORS.length],
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Irrigation wizard — Step {step} of {MAX_STEP}: {currentStep.title}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{currentStep.description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === 1 && (
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Property address</label>
              <Input value={addressQuery} readOnly className="bg-muted" />
              {!addressQuery.trim() ? (
                <p className="text-xs text-muted-foreground">
                  Edit the property address above to enable aerial capture.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-medium">Aerial satellite image</label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void captureAerial()}
                  disabled={capturingAerial || !addressQuery.trim()}
                >
                  {capturingAerial ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {capturingAerial ? "Capturing..." : aerialImageUrl ? "Refresh" : "Capture"}
                </Button>
              </div>
              {capturingAerial && !aerialImageUrl ? (
                <div className="flex h-48 items-center justify-center rounded-md border border-dashed bg-muted/30 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading satellite screenshot...
                </div>
              ) : aerialDisplayUrl ? (
                <img
                  src={aerialDisplayUrl}
                  alt="Aerial satellite view of property"
                  className="max-h-80 w-full rounded-md border object-cover"
                />
              ) : (
                <div className="flex h-48 items-center justify-center rounded-md border border-dashed bg-muted/30 px-4 text-center text-sm text-muted-foreground">
                  No aerial image yet. Add an address and capture from Google Maps.
                </div>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
              <p className="text-sm text-muted-foreground">
                Pre-fill zone count and settings from a linked design project.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void importFromDesign()}
                disabled={importingDesign}
              >
                {importingDesign ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Import from design
              </Button>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium">How many irrigation zones?</label>
              <Input
                type="number"
                min={1}
                max={24}
                value={zoneCount}
                onChange={(e) => {
                  const n = Math.max(1, Math.min(24, Number(e.target.value) || 1));
                  setZoneCount(n);
                  setZones((prev) => zonesForCount(n, prev));
                }}
              />
              <p className="text-xs text-muted-foreground">
                This count is shown on the property profile for your team and customers.
              </p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium">Water source</label>
              <select
                value={waterSource}
                onChange={(e) => setWaterSource(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="">Select water source</option>
                {WATER_SOURCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium">Shutoff valve location</label>
              <Input
                value={shutoffValveLocation}
                onChange={(e) => setShutoffValveLocation(e.target.value)}
                placeholder="e.g. North side of house, near AC unit"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium">Controller location</label>
              <Input
                value={controllerLocation}
                onChange={(e) => setControllerLocation(e.target.value)}
                placeholder="e.g. Garage wall, east side of property"
              />
            </div>
          </div>
        )}

        {step === 3 && aerialDisplayUrl && (
          <AerialZoneMapEditor
            imageUrl={aerialDisplayUrl}
            zones={mapZones}
            activeZoneIndex={activeZoneIndex}
            onActiveZoneChange={setActiveZoneIndex}
            onZonePolygonChange={(index, polygon) => {
              setZones((prev) => {
                const next = [...prev];
                next[index] = { ...next[index], polygon };
                return next;
              });
            }}
          />
        )}

        {step === 4 &&
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
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>
              <div className="grid gap-2 sm:grid-cols-3">
                <select
                  className="w-full rounded border px-2 py-1 text-sm"
                  value={zone.shadeLevel}
                  onChange={(e) => {
                    const next = [...zones];
                    next[i] = { ...next[i], shadeLevel: e.target.value as ShadeLevel };
                    setZones(next);
                  }}
                >
                  {SHADE_LEVELS.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.label}
                    </option>
                  ))}
                </select>
                <select
                  className="w-full rounded border px-2 py-1 text-sm"
                  value={zone.slopeLevel}
                  onChange={(e) => {
                    const next = [...zones];
                    next[i] = { ...next[i], slopeLevel: e.target.value as SlopeLevel };
                    setZones(next);
                  }}
                >
                  {SLOPE_LEVELS.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.label}
                    </option>
                  ))}
                </select>
                <select
                  className="w-full rounded border px-2 py-1 text-sm"
                  value={zone.soilType}
                  onChange={(e) => {
                    const next = [...zones];
                    next[i] = { ...next[i], soilType: e.target.value as SoilType };
                    setZones(next);
                  }}
                >
                  {SOIL_TYPES.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}

        {step === 5 &&
          zones.map((zone, i) => (
            <div key={i} className="rounded border p-3 space-y-2">
              <p className="text-sm font-medium">{zone.name}</p>
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
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
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
            </div>
          ))}

        {step === 6 && (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p>
                <strong>{zoneCount}</strong> zone{zoneCount === 1 ? "" : "s"} · Shutoff:{" "}
                {shutoffValveLocation || "—"} · Controller: {controllerLocation || "—"}
              </p>
            </div>
            {aerialDisplayUrl && (
              <AerialZoneMapEditor
                imageUrl={aerialDisplayUrl}
                zones={mapZones}
                activeZoneIndex={0}
                onActiveZoneChange={() => {}}
                onZonePolygonChange={() => {}}
                readOnly
              />
            )}
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
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
          )}
          {step < MAX_STEP ? (
            <Button onClick={goNext}>Next</Button>
          ) : (
            <Button onClick={() => save(true)} disabled={saving}>
              {saving ? "Publishing..." : "Publish to portal"}
            </Button>
          )}
          <Button variant="secondary" onClick={() => save(false)} disabled={saving}>
            Save draft
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
