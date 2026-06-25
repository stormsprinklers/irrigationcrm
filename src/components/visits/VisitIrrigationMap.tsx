"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AerialZoneMapEditor, type ZoneMapEntry } from "@/components/customers/AerialZoneMapEditor";
import { blobProxyUrl } from "@/lib/blob/urls";
import { ZONE_MAP_COLORS } from "@/lib/irrigation/constants";
import { polygonFromGeoJson } from "@/lib/irrigation/image-polygon";

type Props = {
  customerId: string;
  propertyId: string;
  propertyName: string;
  aerialImageUrl?: string | null;
  propertyDiagramUrl?: string | null;
  irrigationMapStatus?: string | null;
};

function setupUrl(customerId: string, propertyId: string) {
  return `/customers/${customerId}?tab=properties&propertyId=${propertyId}`;
}

export function VisitIrrigationMap({
  customerId,
  propertyId,
  propertyName,
  aerialImageUrl,
  propertyDiagramUrl,
  irrigationMapStatus,
}: Props) {
  const [zones, setZones] = useState<ZoneMapEntry[]>([]);
  const [loadingZones, setLoadingZones] = useState(true);

  const mapImageUrl = blobProxyUrl(propertyDiagramUrl || aerialImageUrl);
  const editHref = setupUrl(customerId, propertyId);

  useEffect(() => {
    let cancelled = false;
    setLoadingZones(true);
    fetch(`/api/customers/${customerId}/properties/${propertyId}/irrigation-map`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.property?.irrigationMapZones) return;
        const entries: ZoneMapEntry[] = data.property.irrigationMapZones.map(
          (zone: { name: string; polygonGeoJson: unknown }, index: number) => ({
            name: zone.name,
            polygon: polygonFromGeoJson(zone.polygonGeoJson),
            color: ZONE_MAP_COLORS[index % ZONE_MAP_COLORS.length],
          })
        );
        setZones(entries);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingZones(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId, propertyId]);

  if (!mapImageUrl) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3">
        <div>
          <p className="text-sm font-medium">Irrigation map</p>
          <p className="text-sm text-muted-foreground">
            No map for {propertyName} yet. Set one up so techs see zones on site.
          </p>
        </div>
        <Button size="sm" asChild>
          <Link href={editHref}>
            <Plus className="mr-1.5 h-4 w-4" />
            Set up irrigation map
          </Link>
        </Button>
      </div>
    );
  }

  const zonesWithPolygons = zones.filter((zone) => zone.polygon?.length);

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
          {!loadingZones && zonesWithPolygons.length > 0 ? (
            <Badge variant="outline" className="text-[10px]">
              {zonesWithPolygons.length} zone{zonesWithPolygons.length === 1 ? "" : "s"}
            </Badge>
          ) : null}
        </div>
        <Button size="sm" variant="outline" asChild>
          <Link href={editHref}>Edit map</Link>
        </Button>
      </div>
      <div className="p-4">
        {loadingZones ? (
          <p className="mb-3 text-sm text-muted-foreground">Loading zones...</p>
        ) : zonesWithPolygons.length === 0 ? (
          <p className="mb-3 text-sm text-muted-foreground">
            No zone boundaries drawn yet. Edit the map to add zones.
          </p>
        ) : (
          <div className="mb-3 flex flex-wrap gap-2">
            {zonesWithPolygons.map((zone) => (
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
          imageUrl={mapImageUrl}
          zones={zones.length ? zones : [{ name: "Zone 1", polygon: null }]}
          activeZoneIndex={0}
          onActiveZoneChange={() => {}}
          onZonePolygonChange={() => {}}
          readOnly
        />
      </div>
    </section>
  );
}
