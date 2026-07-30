"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { densifyPath } from "@/lib/holiday-lighting/geo";
import { loadMaps3d } from "@/lib/holiday-lighting/load-maps";
import type {
  HolidayLatLng,
  HolidayMeasurements,
} from "@/lib/holiday-lighting/types";
import { cn } from "@/lib/utils";

type Props = {
  center: HolidayLatLng | null;
  measurements: HolidayMeasurements;
  defaultLightStyleKey: string;
  className?: string;
};

function strokeForStyle(styleKey: string | undefined): string {
  const key = (styleKey ?? "").toLowerCase();
  if (key.includes("multi")) return "#E85D75";
  if (key.includes("cool")) return "#D6ECFF";
  return "#FFE08A"; // warm white default
}

export function Holiday3DPreview({
  center,
  measurements,
  defaultLightStyleKey,
  className,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.maps3d.Map3DElement | null>(null);
  const libRef = useRef<google.maps.Maps3DLibrary | null>(null);
  const overlaysRef = useRef<HTMLElement[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orbiting, setOrbiting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!center || !host) {
      setReady(false);
      return;
    }

    (async () => {
      try {
        setError(null);
        const lib = await loadMaps3d();
        if (cancelled) return;
        libRef.current = lib;

        const map3d = new lib.Map3DElement({
          center: { lat: center.lat, lng: center.lng, altitude: 20 },
          range: 220,
          tilt: 60,
          heading: 25,
          mode: lib.MapMode.HYBRID,
        });
        map3d.style.width = "100%";
        map3d.style.height = "100%";
        map3d.style.display = "block";

        host.replaceChildren(map3d);
        mapRef.current = map3d;
        setReady(true);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : "Could not load photorealistic 3D Maps"
        );
        setReady(false);
      }
    })();

    return () => {
      cancelled = true;
      mapRef.current?.stopCameraAnimation?.();
      mapRef.current = null;
      host.replaceChildren();
    };
  }, [center]);

  useEffect(() => {
    const map3d = mapRef.current;
    const lib = libRef.current;
    if (!ready || !map3d || !lib) return;

    const children: HTMLElement[] = [];

    for (const segment of measurements.segments) {
      if (segment.kind !== "roofline" || segment.path.length < 2) continue;
      const densified = densifyPath(segment.path, 4);
      const poly = new lib.Polyline3DElement({
        coordinates: densified.map((p) => ({
          lat: p.lat,
          lng: p.lng,
          altitude: 0.4,
        })),
        altitudeMode: lib.AltitudeMode.RELATIVE_TO_MESH,
        strokeColor: strokeForStyle(segment.lightStyleKey ?? defaultLightStyleKey),
        strokeWidth: 10,
        drawsOccludedSegments: true,
        geodesic: true,
      });
      children.push(poly);
    }

    for (const placement of measurements.placements) {
      const marker = new lib.Marker3DElement({
        position: {
          lat: placement.latLng.lat,
          lng: placement.latLng.lng,
          altitude: 0.5,
        },
        altitudeMode: lib.AltitudeMode.RELATIVE_TO_MESH,
        label: placement.label,
        extruded: true,
      });
      children.push(marker);
    }

    for (const node of overlaysRef.current) {
      try {
        map3d.removeChild(node);
      } catch {
        /* already detached */
      }
    }
    overlaysRef.current = children;
    for (const child of children) map3d.append(child);
  }, [ready, measurements, defaultLightStyleKey]);

  function toggleOrbit() {
    const map3d = mapRef.current;
    if (!map3d || !center) return;
    if (orbiting) {
      map3d.stopCameraAnimation();
      setOrbiting(false);
      return;
    }
    map3d.flyCameraAround({
      camera: {
        center: { lat: center.lat, lng: center.lng, altitude: 20 },
        range: 220,
        tilt: 60,
        heading: 0,
      },
      durationMillis: 40000,
      rounds: 1,
    });
    setOrbiting(true);
  }

  if (!center) {
    return (
      <div
        className={cn(
          "flex min-h-[320px] items-center justify-center rounded-md border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground",
          className
        )}
      >
        Locate the property on the map in step 1 to open the 3D preview.
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Rotate to show the customer. Lights follow Google&apos;s 3D building mesh where available —
          not a custom CAD model of the house.
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!ready || !!error}
          onClick={toggleOrbit}
        >
          {orbiting ? "Stop orbit" : "Orbit house"}
        </Button>
      </div>
      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}. Use the AI photo preview instead if 3D coverage is limited here.
        </p>
      ) : null}
      <div
        ref={hostRef}
        className={cn(
          "relative min-h-[360px] w-full overflow-hidden rounded-md border border-border bg-muted",
          !ready && !error && "animate-pulse"
        )}
      />
    </div>
  );
}
