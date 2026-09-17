"use client";

import { useEffect, useRef, useState } from "react";
import type { HolidayStrandMap, HolidayStrandMapFeature } from "@/lib/holiday-lighting/strand-map";
import { loadGoogleMaps } from "@/lib/holiday-lighting/load-maps";

type Mode = "customer" | "installer";

type Props = {
  map: HolidayStrandMap;
  mode: Mode;
  /** Prefer purchase vs lease totals in the legend. */
  priceField?: "purchaseTotal" | "leaseTotal";
  className?: string;
};

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function featureSubtitle(feature: HolidayStrandMapFeature, mode: Mode, priceField: "purchaseTotal" | "leaseTotal") {
  const price = money(feature[priceField]);
  if (mode === "installer") {
    if (feature.kind === "placement") {
      return `${feature.lightStyleLabel} · ${price}`;
    }
    return `${feature.lengthFtWithMargin.toFixed(1)} ft (incl. margin) · ${price}`;
  }
  return feature.lightStyleLabel;
}

export function HolidayStrandMapViewer({
  map,
  mode,
  priceField = "purchaseTotal",
  className,
}: Props) {
  const mapElement = useRef<HTMLDivElement>(null);
  const [mapError, setMapError] = useState("");
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let googleMap: google.maps.Map | null = null;
    const overlays: Array<google.maps.Polyline | google.maps.Circle> = [];
    setMapError("");
    setMapReady(false);
    if (!map.features.some((feature) => feature.paths.some((path) => path.length >= 2) || feature.placement)) return;
    void loadGoogleMaps().then((googleApi) => {
      if (cancelled || !mapElement.current) return;
      const maps = googleApi.maps;
      const bounds = new maps.LatLngBounds();
      googleMap = new maps.Map(mapElement.current, {
        center: map.center ?? { lat: 39.5, lng: -111.5 },
        zoom: 20,
        maxZoom: 20,
        mapTypeId: "satellite",
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        gestureHandling: "cooperative",
      });
      for (const feature of map.features) {
        for (const path of feature.paths) {
          if (path.length < 2) continue;
          path.forEach((point) => bounds.extend(point));
          overlays.push(new maps.Polyline({
            map: googleMap,
            path,
            strokeColor: feature.color,
            strokeOpacity: 1,
            strokeWeight: 5,
          }));
        }
        if (feature.placement) {
          bounds.extend(feature.placement.latLng);
          overlays.push(new maps.Circle({
            map: googleMap,
            center: feature.placement.latLng,
            radius: feature.placement.radiusMeters,
            fillColor: feature.color,
            fillOpacity: 0.35,
            strokeColor: feature.color,
            strokeWeight: 2,
          }));
        }
      }
      if (!bounds.isEmpty()) googleMap.fitBounds(bounds, 48);
      maps.event.addListenerOnce(googleMap, "tilesloaded", () => {
        if (timeout) clearTimeout(timeout);
        if (!cancelled) setMapReady(true);
      });
      timeout = setTimeout(() => {
        if (!cancelled) setMapError("Satellite imagery did not load. Check the Google Maps key and Maps JavaScript API.");
      }, 15000);
    }).catch((error) => {
      if (!cancelled) setMapError(error instanceof Error ? error.message : "Satellite map unavailable");
    });
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
      overlays.forEach((overlay) => overlay.setMap(null));
      if (googleMap) window.google?.maps.event.clearInstanceListeners(googleMap);
    };
  }, [map]);

  if (!map.features.length) {
    return (
      <p className="text-sm text-muted-foreground">No strand placements on this quote.</p>
    );
  }
  const hasGeometry = map.features.some((feature) => feature.paths.some((path) => path.length >= 2) || feature.placement);

  return (
    <div className={className}>
      <div className="relative overflow-hidden rounded-lg border border-border bg-muted">
        {hasGeometry ? <>
          <div ref={mapElement} className="h-[360px] w-full" role="img" aria-label="Satellite view of holiday lighting strands" />
          {!mapReady && !mapError ? <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/70 text-sm text-muted-foreground">Loading satellite map…</div> : null}
          {mapError ? <div className="absolute inset-0 flex items-center justify-center bg-background p-4 text-center text-sm text-destructive">{mapError}</div> : null}
        </> : <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">No map geometry</div>}
      </div>

      <ul className="mt-3 space-y-2">
        {map.features.map((feature) => {
          const subtitle = featureSubtitle(feature, mode, priceField);
          return (
          <li
            key={feature.id}
            className="flex items-start gap-3 rounded-md border border-border bg-white px-3 py-2 text-sm"
          >
            <span
              className="mt-1 h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: feature.color }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="font-semibold" style={{ color: feature.color }}>
                {feature.label}
              </p>
              {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
              {mode === "installer" && feature.kind !== "placement" ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Measured {feature.lengthFt.toFixed(1)} ft · margin {map.marginPct}% →{" "}
                  {feature.lengthFtWithMargin.toFixed(1)} ft
                </p>
              ) : null}
            </div>
            {mode === "installer" ? (
              <p className="shrink-0 font-medium">{money(feature[priceField])}</p>
            ) : null}
          </li>
          );
        })}
      </ul>
    </div>
  );
}
