"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { pathLengthFeet } from "@/lib/holiday-lighting/geo";
import { loadGoogleMaps } from "@/lib/holiday-lighting/load-maps";
import type {
  HolidayLatLng,
  HolidayMeasurementPlacement,
  HolidayMeasurementSegment,
  HolidayMeasurements,
  HolidaySegmentKind,
} from "@/lib/holiday-lighting/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = {
  center: HolidayLatLng | null;
  measurements: HolidayMeasurements;
  onChange: (next: HolidayMeasurements) => void;
  defaultLightStyleKey: string;
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

type DrawMode = "select" | "roofline" | "peak" | "garland" | "tree" | "bush";

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
    { center, measurements, onChange, defaultLightStyleKey },
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
      const currentMode = modeRef.current;
      if (currentMode === "tree" || currentMode === "bush") {
        const placement: HolidayMeasurementPlacement = {
          id: newId(),
          kind: currentMode,
          size: currentMode === "bush" ? "small" : "medium",
          label: currentMode === "bush" ? "Bush" : "Tree",
          latLng,
        };
        onChange({
          ...measurements,
          placements: [...measurements.placements, placement],
        });
        return;
      }

      if (currentMode === "select") return;

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
      const kind = modeRef.current;
      if (kind !== "roofline" && kind !== "peak" && kind !== "garland") return;
      if (draftPath.current.length < 2 && kind !== "peak") return;
      if (kind === "peak" && draftPath.current.length < 1) return;

      const path =
        kind === "peak" && draftPath.current.length === 1
          ? [draftPath.current[0]!, draftPath.current[0]!]
          : draftPath.current;
    const segment: HolidayMeasurementSegment = {
      id: newId(),
      label:
        kind === "roofline"
          ? `Roofline ${measurements.segments.length + 1}`
          : kind === "peak"
            ? `Peak ${measurements.segments.length + 1}`
            : `Garland ${measurements.segments.length + 1}`,
      kind: kind as HolidaySegmentKind,
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
      setActiveSegmentId(segment.id);
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
        line.addListener("click", () => setActiveSegmentId(segment.id));
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

    function removeActiveSegment() {
      if (!activeSegmentId) return;
      onChange({
        ...measurements,
        segments: measurements.segments.filter((s) => s.id !== activeSegmentId),
      });
      setActiveSegmentId(null);
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

    return (
      <div className="flex h-full min-h-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["roofline", "Draw roofline"],
              ["peak", "Mark peak"],
              ["garland", "Draw garland"],
              ["tree", "Place tree"],
              ["bush", "Place bush"],
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
          {mode === "roofline" || mode === "garland" || mode === "peak" ? (
            <>
              <Button type="button" size="sm" onClick={finishSegment}>
                Finish segment
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={clearDraft}>
                Cancel draft
              </Button>
            </>
          ) : null}
        </div>

        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="grid min-h-0 flex-1 gap-2 lg:grid-cols-2">
          <div
            ref={mapRef}
            className={cn(
              "min-h-[280px] rounded-md border border-border bg-muted",
              !ready && "animate-pulse"
            )}
          />
          <div
            ref={panoRef}
            className={cn(
              "min-h-[280px] rounded-md border border-border bg-muted",
              !ready && "animate-pulse"
            )}
          />
        </div>

        <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border border-border bg-white p-2 text-sm">
          <p className="text-xs font-medium text-muted-foreground">
            Segments ({measurements.segments.length}) · Trees/bushes (
            {measurements.placements.length})
          </p>
          {measurements.segments.map((s) => (
            <button
              key={s.id}
              type="button"
              className={cn(
                "flex w-full items-center justify-between rounded px-2 py-1 text-left hover:bg-muted",
                s.id === activeSegmentId && "bg-muted"
              )}
              onClick={() => setActiveSegmentId(s.id)}
            >
              <span>
                {s.label}{" "}
                <span className="text-muted-foreground">({s.kind})</span>
              </span>
              <span className="font-mono text-xs">{s.lengthFt.toFixed(1)} ft</span>
            </button>
          ))}
          {active ? (
            <div className="flex flex-wrap items-center gap-2 border-t pt-2">
              <Input
                className="h-8 max-w-xs"
                value={active.label}
                onChange={(e) => renameActive(e.target.value)}
              />
              <Button type="button" size="sm" variant="ghost" onClick={removeActiveSegment}>
                Remove
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
