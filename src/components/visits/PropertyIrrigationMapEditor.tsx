"use client";

import { useCallback, useEffect, useState } from "react";
import { Maximize2, Pencil, Plus, Save, ZoomIn } from "lucide-react";
import { toast } from "sonner";
import {
  AerialZoneMapEditor,
  type MapMarkerEntry,
  type ZoneMapEntry,
} from "@/components/customers/AerialZoneMapEditor";
import { AerialCropDialog, type AerialCropRect } from "@/components/customers/AerialCropDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  IRRIGATION_MAP_MARKER_KINDS,
  MAP_MARKER_STYLES,
  WATER_SOURCE_OPTIONS,
  ZONE_MAP_COLORS,
  type IrrigationMapMarkerKind,
} from "@/lib/irrigation/constants";
import {
  pointFromGeoJson,
  pointToGeoJson,
  polygonFromGeoJson,
  polygonToGeoJson,
  type ImagePoint,
  type ImagePolygon,
} from "@/lib/irrigation/image-polygon";
import { blobProxyUrl } from "@/lib/blob/urls";
import {
  defaultZoneAttributes,
  IrrigationZoneAttributesPanel,
} from "@/components/irrigation/IrrigationZoneAttributesPanel";
import { resolveZoneGpm } from "@/lib/irrigation/runtime-engine";
import type { IrrigationType } from "@/lib/irrigation/types";

type MapZoneState = {
  name: string;
  polygon: ImagePolygon | null;
  vegetationType?: string | null;
  shadeLevel?: string | null;
  slopeLevel?: string | null;
  soilType?: string | null;
  irrigationType?: string | null;
  nozzleCount?: number | null;
  estimatedGpm?: number | null;
  baseRuntimeMinutes?: number | null;
  irrigatedSqFt?: number | null;
  irrigationEfficiencyScore?: number | null;
  establishmentStage?: string | null;
  nozzleGpm?: number | null;
};

type Props = {
  customerId: string;
  propertyId: string;
  propertyName: string;
  aerialImageUrl?: string | null;
  propertyDiagramUrl?: string | null;
  irrigationMapStatus?: string | null;
  allowInlineEdit?: boolean;
};

function newMarkerId() {
  return `marker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultLabel(type: IrrigationMapMarkerKind, index: number) {
  return `${MAP_MARKER_STYLES[type].label} ${index + 1}`;
}

export function PropertyIrrigationMapEditor({
  customerId,
  propertyId,
  propertyName,
  aerialImageUrl,
  propertyDiagramUrl,
  irrigationMapStatus,
  allowInlineEdit = false,
}: Props) {
  const [zones, setZones] = useState<MapZoneState[]>([]);
  const [markers, setMarkers] = useState<MapMarkerEntry[]>([]);
  const [waterSource, setWaterSource] = useState<string>("");
  const [activeZoneIndex, setActiveZoneIndex] = useState(0);
  const [markerPlacement, setMarkerPlacement] = useState<IrrigationMapMarkerKind | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aerialUrl, setAerialUrl] = useState<string | null>(aerialImageUrl ?? null);
  const [diagramUrl, setDiagramUrl] = useState<string | null>(propertyDiagramUrl ?? null);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropBusy, setCropBusy] = useState(false);

  const mapImageUrl = blobProxyUrl(diagramUrl || aerialUrl);

  const loadMap = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/customers/${customerId}/properties/${propertyId}/irrigation-map`
      );
      const data = res.ok ? await res.json() : null;
      const property = data?.property;
      if (!property) return;

      setAerialUrl(property.aerialImageUrl ?? null);
      setDiagramUrl(property.propertyDiagramUrl ?? null);
      setWaterSource(property.waterSource ?? "");
      setZones(
        (property.irrigationMapZones ?? []).map(
          (zone: {
            name: string;
            polygonGeoJson: unknown;
            vegetationType?: string | null;
            shadeLevel?: string | null;
            slopeLevel?: string | null;
            soilType?: string | null;
            irrigationType?: string | null;
            nozzleCount?: number | null;
            estimatedGpm?: number | null;
            baseRuntimeMinutes?: number | null;
            irrigatedSqFt?: number | null;
            irrigationEfficiencyScore?: number | null;
            establishmentStage?: string | null;
            nozzleGpm?: number | null;
          }, index: number) => ({
            name: zone.name,
            polygon: polygonFromGeoJson(zone.polygonGeoJson),
            vegetationType: zone.vegetationType,
            shadeLevel: zone.shadeLevel,
            slopeLevel: zone.slopeLevel,
            soilType: zone.soilType,
            irrigationType: zone.irrigationType,
            nozzleCount: zone.nozzleCount,
            estimatedGpm: zone.estimatedGpm,
            baseRuntimeMinutes: zone.baseRuntimeMinutes,
            irrigatedSqFt: zone.irrigatedSqFt,
            irrigationEfficiencyScore: zone.irrigationEfficiencyScore,
            establishmentStage: zone.establishmentStage ?? "NORMAL",
            nozzleGpm: zone.nozzleGpm,
            color: ZONE_MAP_COLORS[index % ZONE_MAP_COLORS.length],
          })
        )
      );

      const loadedMarkers: MapMarkerEntry[] = [
        ...(property.irrigationValves ?? []).map(
          (valve: { id: string; label: string; pointGeoJson: unknown }) => ({
            id: valve.id,
            type: "VALVE" as const,
            label: valve.label,
            point: pointFromGeoJson(valve.pointGeoJson),
          })
        ),
        ...(property.irrigationControllers ?? []).map(
          (controller: { id: string; label: string; pointGeoJson: unknown }) => ({
            id: controller.id,
            type: "TIMER" as const,
            label: controller.label,
            point: pointFromGeoJson(controller.pointGeoJson),
          })
        ),
        ...(property.irrigationMapMarkers ?? []).map(
          (marker: { id: string; type: IrrigationMapMarkerKind; label: string | null; pointGeoJson: unknown }) => ({
            id: marker.id,
            type: marker.type,
            label: marker.label ?? MAP_MARKER_STYLES[marker.type].label,
            point: pointFromGeoJson(marker.pointGeoJson),
          })
        ),
      ];
      setMarkers(loadedMarkers.filter((m) => m.point != null));
    } finally {
      setLoading(false);
    }
  }, [customerId, propertyId]);

  useEffect(() => {
    void loadMap();
  }, [loadMap]);

  useEffect(() => {
    setActiveZoneIndex((index) => Math.min(index, Math.max(0, zones.length - 1)));
  }, [zones.length]);

  const mapZones: ZoneMapEntry[] = zones.map((zone, index) => ({
    name: zone.name,
    polygon: zone.polygon,
    color: ZONE_MAP_COLORS[index % ZONE_MAP_COLORS.length],
  }));

  async function saveMap(publish = false) {
    setSaving(true);
    try {
      const valves = markers
        .filter((m) => m.type === "VALVE" && m.point)
        .map((m) => ({
          label: m.label,
          pointGeoJson: pointToGeoJson(m.point),
          zoneIds: [] as string[],
        }));

      const controllers = markers
        .filter((m) => m.type === "TIMER" && m.point)
        .map((m) => ({
          label: m.label,
          pointGeoJson: pointToGeoJson(m.point),
          stationCount: 1,
        }));

      const mapMarkers = markers
        .filter((m) => (m.type === "POC" || m.type === "FILTER" || m.type === "BACKFLOW") && m.point)
        .map((m) => ({
          type: m.type,
          label: m.label,
          pointGeoJson: pointToGeoJson(m.point),
        }));

      const res = await fetch(
        `/api/customers/${customerId}/properties/${propertyId}/irrigation-map`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            property: {
              waterSource: waterSource || null,
              irrigationZoneCount: zones.length,
            },
            mapZones: zones.map((zone) => {
              const irrigationType = (zone.irrigationType ?? "spray") as IrrigationType;
              const totalGpm = resolveZoneGpm(
                irrigationType,
                zone.nozzleCount,
                zone.estimatedGpm,
                zone.nozzleGpm
              );
              return {
                name: zone.name,
                polygonGeoJson: polygonToGeoJson(zone.polygon),
                vegetationType: zone.vegetationType,
                shadeLevel: zone.shadeLevel,
                slopeLevel: zone.slopeLevel,
                soilType: zone.soilType,
                irrigationType: zone.irrigationType,
                nozzleCount: zone.nozzleCount,
                estimatedGpm: totalGpm,
                irrigatedSqFt: zone.irrigatedSqFt,
                irrigationEfficiencyScore: zone.irrigationEfficiencyScore,
                establishmentStage: zone.establishmentStage ?? "NORMAL",
                nozzleGpm: zone.nozzleGpm,
                baseRuntimeMinutes: zone.baseRuntimeMinutes,
              };
            }),
            valves,
            controllers,
            mapMarkers,
            publish,
          }),
        }
      );
      if (!res.ok) {
        toast.error("Failed to save irrigation map");
        return;
      }
      toast.success(publish ? "Irrigation map published" : "Irrigation map saved");
      setEditing(false);
      setMarkerPlacement(null);
      await loadMap();
    } finally {
      setSaving(false);
    }
  }

  async function recaptureAerial(crop?: AerialCropRect) {
    setCropBusy(true);
    try {
      const res = await fetch(
        `/api/customers/${customerId}/properties/${propertyId}/irrigation-map/aerial`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(crop ? { crop } : {}),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Failed to update aerial image");
        return;
      }
      setCropOpen(false);
      await loadMap();
      toast.success(crop ? "Zoomed in — zones realigned to the new image" : "Reset to full property view");
    } finally {
      setCropBusy(false);
    }
  }

  function handleMarkerPlace(type: IrrigationMapMarkerKind, point: ImagePoint) {
    const count = markers.filter((m) => m.type === type).length;
    setMarkers((prev) => [
      ...prev,
      { id: newMarkerId(), type, label: defaultLabel(type, count), point },
    ]);
    setMarkerPlacement(null);
  }

  function handleZoneAdd() {
    setZones((prev) => [
      ...prev,
      { name: `Zone ${prev.length + 1}`, polygon: null, ...defaultZoneAttributes() },
    ]);
    setActiveZoneIndex(zones.length);
  }

  function handleZoneRemove(index: number) {
    setZones((prev) => prev.filter((_, i) => i !== index));
    setActiveZoneIndex((i) => Math.max(0, Math.min(i, zones.length - 2)));
  }

  if (!mapImageUrl) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3">
        <div>
          <p className="text-sm font-medium">Irrigation map</p>
          <p className="text-sm text-muted-foreground">
            No map for {propertyName} yet. Set one up from the customer profile.
          </p>
        </div>
      </div>
    );
  }

  const zonesWithPolygons = zones.filter((zone) => zone.polygon?.length);
  const isEditing = editing && allowInlineEdit;

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">Irrigation map</h2>
          <span className="text-sm text-muted-foreground">· {propertyName}</span>
          {irrigationMapStatus === "PUBLISHED" ? (
            <Badge variant="secondary" className="text-[10px]">
              Published
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">
              Draft
            </Badge>
          )}
          {!loading && zonesWithPolygons.length > 0 ? (
            <Badge variant="outline" className="text-[10px]">
              {zonesWithPolygons.length} zone{zonesWithPolygons.length === 1 ? "" : "s"}
            </Badge>
          ) : null}
        </div>
        {allowInlineEdit ? (
          <div className="flex gap-2">
            {aerialUrl ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCropOpen(true)}
                  disabled={cropBusy}
                >
                  <ZoomIn className="mr-1.5 h-3.5 w-3.5" />
                  Zoom in
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void recaptureAerial()}
                  disabled={cropBusy}
                  title="Reset to the full property view"
                >
                  <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
                  Reset
                </Button>
              </>
            ) : null}
            {isEditing ? (
              <>
                <Button size="sm" variant="outline" onClick={() => { setEditing(false); setMarkerPlacement(null); void loadMap(); }}>
                  Cancel
                </Button>
                <Button size="sm" onClick={() => saveMap()} disabled={saving}>
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  {saving ? "Saving..." : "Save"}
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setMarkerPlacement(null);
                  setEditing(true);
                }}
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Edit map
              </Button>
            )}
          </div>
        ) : null}
      </div>

      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium">Water source</label>
          <select
            value={waterSource}
            onChange={(e) => setWaterSource(e.target.value)}
            disabled={!isEditing}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">Not specified</option>
            {WATER_SOURCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {isEditing && (
          <div className="flex flex-wrap gap-2">
            <span className="text-xs font-medium text-muted-foreground">Place on map:</span>
            {IRRIGATION_MAP_MARKER_KINDS.map((kind) => (
              <Button
                key={kind}
                type="button"
                size="sm"
                variant={markerPlacement === kind ? "default" : "outline"}
                onClick={() => setMarkerPlacement((prev) => (prev === kind ? null : kind))}
                className="gap-1.5"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: MAP_MARKER_STYLES[kind].color }}
                />
                {MAP_MARKER_STYLES[kind].label}
                <Plus className="h-3 w-3 opacity-70" />
              </Button>
            ))}
          </div>
        )}

        {!isEditing && markers.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {IRRIGATION_MAP_MARKER_KINDS.map((kind) => {
              const count = markers.filter((m) => m.type === kind).length;
              if (!count) return null;
              return (
                <Badge key={kind} variant="outline" className="gap-1.5 text-[10px]">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: MAP_MARKER_STYLES[kind].color }}
                  />
                  {count} {MAP_MARKER_STYLES[kind].label}
                  {count === 1 ? "" : "s"}
                </Badge>
              );
            })}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading map...</p>
        ) : (
          <>
            {!isEditing && zonesWithPolygons.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {mapZones
                  .filter((zone) => zone.polygon?.length)
                  .map((zone) => (
                    <span
                      key={zone.name}
                      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs"
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: zone.color }}
                      />
                      {zone.name}
                    </span>
                  ))}
              </div>
            )}
            <AerialZoneMapEditor
              key={isEditing ? "edit" : "view"}
              imageUrl={mapImageUrl}
              zones={zones.length ? mapZones : [{ name: "Zone 1", polygon: null }]}
              activeZoneIndex={activeZoneIndex}
              onActiveZoneChange={setActiveZoneIndex}
              onZonePolygonChange={(index, polygon) =>
                setZones((prev) =>
                  prev.map((zone, i) => (i === index ? { ...zone, polygon } : zone))
                )
              }
              readOnly={!isEditing}
              focusOnZones={!isEditing}
              markers={markers}
              markerPlacement={isEditing ? markerPlacement : null}
              onMarkerPlace={isEditing ? handleMarkerPlace : undefined}
              onMarkerRemove={isEditing ? (id) => setMarkers((prev) => prev.filter((m) => m.id !== id)) : undefined}
              onZoneRename={isEditing ? (index, name) => setZones((prev) => prev.map((z, i) => (i === index ? { ...z, name } : z))) : undefined}
              onZoneAdd={isEditing ? handleZoneAdd : undefined}
              onZoneRemove={isEditing ? handleZoneRemove : undefined}
            />
            {isEditing && zones.length > 0 && activeZoneIndex < zones.length ? (
              <div className="space-y-3">
                {zones.length > 1 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">Zone attributes:</span>
                    {zones.map((zone, index) => {
                      const color = ZONE_MAP_COLORS[index % ZONE_MAP_COLORS.length];
                      const isActive = index === activeZoneIndex;
                      return (
                        <button
                          key={`attr-tab-${index}`}
                          type="button"
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                            isActive
                              ? "border-primary bg-primary text-primary-foreground"
                              : "bg-background hover:bg-muted"
                          )}
                          onClick={() => setActiveZoneIndex(index)}
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: color }}
                          />
                          {zone.name}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                <IrrigationZoneAttributesPanel
                  zoneName={zones[activeZoneIndex]?.name ?? `Zone ${activeZoneIndex + 1}`}
                  attributes={zones[activeZoneIndex] ?? {}}
                  onChange={(attrs) =>
                    setZones((prev) =>
                      prev.map((zone, i) => (i === activeZoneIndex ? { ...zone, ...attrs } : zone))
                    )
                  }
                />
              </div>
            ) : null}
          </>
        )}
      </div>

      {cropOpen && aerialUrl ? (
        <AerialCropDialog
          imageUrl={blobProxyUrl(aerialUrl) ?? ""}
          busy={cropBusy}
          onApply={(crop) => void recaptureAerial(crop)}
          onClose={() => setCropOpen(false)}
        />
      ) : null}
    </section>
  );
}
