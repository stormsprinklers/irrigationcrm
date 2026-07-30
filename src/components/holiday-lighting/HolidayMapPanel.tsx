"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { pathLengthFeet } from "@/lib/holiday-lighting/geo";
import { loadGoogleMaps } from "@/lib/holiday-lighting/load-maps";
import type {
  HolidayLatLng,
  HolidayMeasurementSegment,
  HolidayMeasurements,
} from "@/lib/holiday-lighting/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = {
  center: HolidayLatLng | null;
  measurements: HolidayMeasurements;
  onChange: (next: HolidayMeasurements) => void;
  defaultLightStyleKey: string;
  onSelectSegment?: (id: string | null) => void;
};

export type StreetViewCapturePose = {
  lat: number;
  lng: number;
  heading: number;
  pitch: number;
  fov: number;
  panoId: string | null;
};

export type HolidayMapPanelHandle = {
  getStreetViewPose: () => StreetViewCapturePose | null;
};

/** Roofline-only for now; tree/bush placement tools come back later. */
type DrawMode = "select" | "roofline";

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Map Street View JS zoom to Static API FOV (degrees). */
function streetViewZoomToFov(zoom: number) {
  const fov = 180 / Math.pow(2, zoom);
  return Math.min(120, Math.max(10, Math.round(fov)));
}

export const HolidayMapPanel = forwardRef<HolidayMapPanelHandle, Props>(
  function HolidayMapPanel(
    { center, measurements, onChange, defaultLightStyleKey, onSelectSegment },
    ref
  ) {
    const mapRef = useRef<HTMLDivElement>(null);
    const panoRef = useRef<HTMLDivElement>(null);
    const mapObj = useRef<google.maps.Map | null>(null);
    const panoObj = useRef<google.maps.StreetViewPanorama | null>(null);
    const polylines = useRef<google.maps.Polyline[]>([]);
    const markers = useRef<google.maps.Marker[]>([]);
    const draftPath = useRef<HolidayLatLng[]>([]);
    const draftLine = useRef<google.maps.Polyline | null>(null);

    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mode, setMode] = useState<DrawMode>("roofline");
    const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
    const modeRef = useRef(mode);
    modeRef.current = mode;

    function selectSegment(id: string | null) {
      setActiveSegmentId(id);
      onSelectSegment?.(id);
    }

    useImperativeHandle(ref, () => ({
      getStreetViewPose: () => {
        const pano = panoObj.current;
        if (!pano) return null;
        const position = pano.getPosition();
        if (!position) return null;
        const pov = pano.getPov();
        const zoom = typeof pano.getZoom === "function" ? pano.getZoom() : 1;
        return {
          lat: position.lat(),
          lng: position.lng(),
          heading: Number.isFinite(pov.heading) ? pov.heading : 0,
          pitch: Number.isFinite(pov.pitch) ? pov.pitch : 0,
          fov: streetViewZoomToFov(typeof zoom === "number" ? zoom : 1),
          panoId: typeof pano.getPano === "function" ? pano.getPano() || null : null,
        };
      },
    }));

    useEffect(() => {
      let cancelled = false;
      loadGoogleMaps()
        .then((g) => {
          if (cancelled || !mapRef.current || !panoRef.current) return;
          const start = center ?? { lat: 40.2969, lng: -111.6946 };
          const map = new g.maps.Map(mapRef.current, {
            center: start,
            zoom: 20,
            mapTypeId: "satellite",
            tilt: 0,
            streetViewControl: true,
            fullscreenControl: false,
            mapTypeControl: true,
          });
          const pano = new g.maps.StreetViewPanorama(panoRef.current, {
            position: start,
            pov: { heading: 0, pitch: 0 },
            zoom: 1,
            addressControl: false,
          });
          map.setStreetView(pano);
          mapObj.current = map;
          panoObj.current = pano;

          map.addListener("click", (e: google.maps.MapMouseEvent) => {
            if (!e.latLng) return;
            handleMapClick({ lat: e.latLng.lat(), lng: e.latLng.lng() });
          });

          setReady(true);
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Maps failed to load"));

      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      if (!mapObj.current || !center) return;
      mapObj.current.setCenter(center);
      mapObj.current.setZoom(20);
      panoObj.current?.setPosition(center);
    }, [center]);

    useEffect(() => {
      redrawOverlays();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [measurements, ready, activeSegmentId]);

    function handleMapClick(latLng: HolidayLatLng) {
      if (modeRef.current === "select") return;
      draftPath.current = [...draftPath.current, latLng];
      updateDraftLine();
    }

    function updateDraftLine() {
      const g = window.google;
      if (!g || !mapObj.current) return;
      draftLine.current?.setMap(null);
      if (draftPath.current.length < 1) return;
      draftLine.current = new g.maps.Polyline({
        path: draftPath.current,
        strokeColor: "#E6C27A",
        strokeWeight: 3,
        map: mapObj.current,
        editable: false,
      });
    }

    function finishSegment() {
      if (modeRef.current !== "roofline") return;
      if (draftPath.current.length < 2) return;

      const path = draftPath.current;
      const segment: HolidayMeasurementSegment = {
        id: newId(),
        label: `Roofline ${measurements.segments.filter((s) => s.kind === "roofline").length + 1}`,
        kind: "roofline",
        path,
        lengthFt: pathLengthFeet(path),
        horizontalLengthFt: pathLengthFeet(path),
        lightStyleKey: defaultLightStyleKey,
      };
      onChange({
        ...measurements,
        segments: [...measurements.segments, segment],
      });
      draftPath.current = [];
      draftLine.current?.setMap(null);
      draftLine.current = null;
      selectSegment(segment.id);
    }

    function clearDraft() {
      draftPath.current = [];
      draftLine.current?.setMap(null);
      draftLine.current = null;
    }

    function redrawOverlays() {
      const g = window.google;
      const map = mapObj.current;
      if (!g || !map) return;

      for (const line of polylines.current) line.setMap(null);
      for (const marker of markers.current) marker.setMap(null);
      polylines.current = [];
      markers.current = [];

      for (const segment of measurements.segments) {
        const line = new g.maps.Polyline({
          path: segment.path,
          strokeColor: segment.id === activeSegmentId ? "#F17388" : "#4C9BC8",
          strokeWeight: segment.id === activeSegmentId ? 4 : 3,
          map,
        });
        line.addListener("click", () => selectSegment(segment.id));
        polylines.current.push(line);
      }

      for (const placement of measurements.placements) {
        const marker = new g.maps.Marker({
          position: placement.latLng,
          map,
          label: placement.kind === "bush" ? "B" : "T",
          title: placement.label,
        });
        markers.current.push(marker);
      }
    }

    function removeSegment(id: string) {
      onChange({
        ...measurements,
        segments: measurements.segments.filter((s) => s.id !== id),
        streetTraces: (measurements.streetTraces ?? []).filter(
          (t) => t.satelliteSegmentId !== id
        ),
      });
      if (activeSegmentId === id) selectSegment(null);
    }

    function removeActiveSegment() {
      if (!activeSegmentId) return;
      removeSegment(activeSegmentId);
    }

    function clearAllMeasurements() {
      clearDraft();
      selectSegment(null);
      onChange({
        ...measurements,
        segments: [],
        placements: [],
        streetTraces: [],
      });
    }

    function renameActive(label: string) {
      if (!activeSegmentId) return;
      onChange({
        ...measurements,
        segments: measurements.segments.map((s) =>
          s.id === activeSegmentId ? { ...s, label } : s
        ),
      });
    }

    const active = measurements.segments.find((s) => s.id === activeSegmentId);
    const hasAny =
      measurements.segments.length > 0 || measurements.placements.length > 0;

    return (
      <div className="flex h-full min-h-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["roofline", "Draw roofline"],
              ["select", "Select"],
            ] as const
          ).map(([id, label]) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant={mode === id ? "default" : "outline"}
              onClick={() => {
                clearDraft();
                setMode(id);
              }}
            >
              {label}
            </Button>
          ))}
          {mode === "roofline" ? (
            <>
              <Button type="button" size="sm" onClick={finishSegment}>
                Finish segment
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={clearDraft}>
                Cancel draft
              </Button>
            </>
          ) : null}
          {hasAny ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={clearAllMeasurements}
            >
              Clear all strands
            </Button>
          ) : null}
        </div>

        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="relative z-0 grid min-h-0 flex-1 gap-2 lg:grid-cols-2">
          <div
            ref={mapRef}
            className={cn(
              "relative isolate min-h-[280px] overflow-hidden rounded-md border border-border bg-muted",
              !ready && "animate-pulse"
            )}
          />
          <div
            ref={panoRef}
            className={cn(
              "relative isolate min-h-[280px] overflow-hidden rounded-md border border-border bg-muted",
              !ready && "animate-pulse"
            )}
          />
        </div>

        <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border border-border bg-white p-2 text-sm">
          <p className="text-xs font-medium text-muted-foreground">
            Rooflines ({measurements.segments.filter((s) => s.kind === "roofline").length})
          </p>
          {measurements.segments.length === 0 ? (
            <p className="px-2 py-1 text-xs text-muted-foreground">
              No rooflines yet — click along the roof edge, then Finish segment.
            </p>
          ) : (
            measurements.segments.map((s) => (
              <div
                key={s.id}
                className={cn(
                  "flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted",
                  s.id === activeSegmentId && "bg-muted"
                )}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate px-1 py-1 text-left"
                  onClick={() => selectSegment(s.id)}
                >
                  <span>{s.label}</span>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">
                    {s.lengthFt.toFixed(1)} ft
                  </span>
                </button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 shrink-0 px-2 text-destructive hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSegment(s.id);
                  }}
                >
                  Delete
                </Button>
              </div>
            ))
          )}
          {active ? (
            <div className="flex flex-wrap items-center gap-2 border-t pt-2">
              <Input
                className="h-8 max-w-xs"
                value={active.label}
                onChange={(e) => renameActive(e.target.value)}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={removeActiveSegment}
              >
                Delete strand
              </Button>
            </div>
          ) : null}
          {measurements.placements.length > 0 ? (
            <div className="flex flex-wrap gap-2 border-t pt-2">
              {measurements.placements.map((p) => (
                <Button
                  key={p.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    onChange({
                      ...measurements,
                      placements: measurements.placements.filter((x) => x.id !== p.id),
                    })
                  }
                >
                  {p.label} ({p.size}) ×
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  }
);
