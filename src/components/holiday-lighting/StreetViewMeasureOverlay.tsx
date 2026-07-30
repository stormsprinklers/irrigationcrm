"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { upsertStreetTrace } from "@/lib/holiday-lighting/pitch-match";
import { pitchDegFromImageLine } from "@/lib/holiday-lighting/roof-pitch";
import type {
  HolidayMeasurements,
  StreetViewNormPoint,
} from "@/lib/holiday-lighting/types";
import { cn } from "@/lib/utils";

type DrawMode = "single" | "gable";

type Props = {
  imageUrl: string;
  measurements: HolidayMeasurements;
  selectedSegmentId: string | null;
  onSelectSegment: (id: string | null) => void;
  onChange: (next: HolidayMeasurements) => void;
};

export function StreetViewMeasureOverlay({
  imageUrl,
  measurements,
  selectedSegmentId,
  onSelectSegment,
  onChange,
}: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [drawMode, setDrawMode] = useState<DrawMode>("single");
  const [draft, setDraft] = useState<StreetViewNormPoint[]>([]);
  const [aspect, setAspect] = useState(4 / 3);
  const needed = drawMode === "gable" ? 3 : 2;

  const traces = measurements.streetTraces ?? [];
  const selectedTrace = traces.find((t) => t.satelliteSegmentId === selectedSegmentId);

  useEffect(() => {
    setDraft([]);
  }, [selectedSegmentId, drawMode, imageUrl]);

  function toNorm(clientX: number, clientY: number): StreetViewNormPoint | null {
    const img = imgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!selectedSegmentId) return;
    const pt = toNorm(e.clientX, e.clientY);
    if (!pt) return;
    const next = [...draft, pt];
    if (next.length >= needed) {
      onChange(upsertStreetTrace(measurements, selectedSegmentId, next.slice(0, needed)));
      setDraft([]);
      return;
    }
    setDraft(next);
  }

  function clearTrace() {
    if (!selectedSegmentId) return;
    const streetTraces = (measurements.streetTraces ?? []).filter(
      (t) => t.satelliteSegmentId !== selectedSegmentId
    );
    const segments = measurements.segments.map((seg) => {
      if (seg.id !== selectedSegmentId) return seg;
      const horizontal = seg.horizontalLengthFt ?? seg.lengthFt;
      return {
        ...seg,
        horizontalLengthFt: horizontal,
        lengthFt: horizontal,
        pitchDeg: undefined,
        pitchDegRight: undefined,
        riseFt: undefined,
        lengthFtRight: undefined,
      };
    });
    onChange({ ...measurements, segments, streetTraces });
    setDraft([]);
  }

  const draftHint = !selectedSegmentId
    ? "Select a satellite segment below, then click on the photo."
    : drawMode === "single"
      ? draft.length === 0
        ? "Click one end of this roof edge, then the other."
        : draft.length === 1
          ? "Click the other end of the roof edge."
          : "Trace complete."
      : draft.length === 0
        ? "Click left eave, then the peak, then right eave."
        : draft.length === 1
          ? "Click the peak."
          : draft.length === 2
            ? "Click the right eave."
            : "Gable trace complete.";

  const livePitch =
    draft.length >= 2
      ? pitchDegFromImageLine(draft[draft.length - 2]!, draft[draft.length - 1]!)
      : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={drawMode === "single" ? "default" : "outline"}
          onClick={() => setDrawMode("single")}
        >
          Single slope
        </Button>
        <Button
          type="button"
          size="sm"
          variant={drawMode === "gable" ? "default" : "outline"}
          onClick={() => setDrawMode("gable")}
        >
          Gable (two slopes)
        </Button>
        {selectedSegmentId && selectedTrace ? (
          <Button type="button" size="sm" variant="ghost" onClick={clearTrace}>
            Clear match
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{draftHint}</p>
      {livePitch != null ? (
        <p className="text-xs font-medium text-primary">Draft pitch ≈ {livePitch}°</p>
      ) : null}

      <div
        className={cn(
          "relative w-full overflow-hidden rounded-md border border-border bg-muted",
          selectedSegmentId ? "cursor-crosshair" : "cursor-not-allowed"
        )}
        style={{ aspectRatio: `${aspect}` }}
        onPointerDown={onPointerDown}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={imageUrl}
          alt="Street View capture"
          className="pointer-events-none absolute inset-0 h-full w-full object-fill"
          draggable={false}
          onLoad={(e) => {
            const el = e.currentTarget;
            if (el.naturalWidth > 0 && el.naturalHeight > 0) {
              setAspect(el.naturalWidth / el.naturalHeight);
            }
          }}
        />
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
        >
          {traces.map((trace) => {
            const active = trace.satelliteSegmentId === selectedSegmentId;
            const pts = trace.points;
            if (pts.length < 2) return null;
            const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
            return (
              <path
                key={trace.id}
                d={d}
                fill="none"
                stroke={active ? "#F17388" : "#4C9BC8"}
                strokeWidth={0.01}
              />
            );
          })}
          {draft.length > 0 ? (
            <>
              {draft.length > 1 ? (
                <path
                  d={draft.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")}
                  fill="none"
                  stroke="#E6C27A"
                  strokeWidth={0.01}
                  strokeDasharray="0.02 0.015"
                />
              ) : null}
              {draft.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={0.012} fill="#E6C27A" />
              ))}
            </>
          ) : null}
        </svg>
      </div>

      <ul className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-border bg-white p-2 text-xs">
        {measurements.segments.filter((s) => s.kind === "roofline" || s.kind === "garland")
          .length === 0 ? (
          <li className="text-muted-foreground">Draw a roofline on the satellite map first.</li>
        ) : (
          measurements.segments
            .filter((s) => s.kind === "roofline" || s.kind === "garland")
            .map((seg) => {
              const matched = traces.some((t) => t.satelliteSegmentId === seg.id);
              const horizontal = seg.horizontalLengthFt ?? seg.lengthFt;
              return (
                <li key={seg.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left hover:bg-muted",
                      selectedSegmentId === seg.id && "bg-muted"
                    )}
                    onClick={() =>
                      onSelectSegment(selectedSegmentId === seg.id ? null : seg.id)
                    }
                  >
                    <span className="flex justify-between gap-2 font-medium">
                      <span>{seg.label}</span>
                      <span className="text-muted-foreground">
                        {matched ? "Matched" : "Needs pitch"}
                      </span>
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      Plan {horizontal.toFixed(1)} ft
                      {seg.pitchDeg != null ? ` · ${seg.pitchDeg}°` : ""}
                      {seg.pitchDegRight != null ? ` / ${seg.pitchDegRight}°` : ""}
                      {seg.riseFt != null ? ` · rise ${seg.riseFt.toFixed(1)} ft` : ""}
                      {seg.pitchDeg != null
                        ? seg.lengthFtRight != null
                          ? ` · true ${seg.lengthFt.toFixed(1)}+${seg.lengthFtRight.toFixed(1)} ft`
                          : ` · true ${seg.lengthFt.toFixed(1)} ft`
                        : ""}
                    </span>
                  </button>
                </li>
              );
            })
        )}
      </ul>
    </div>
  );
}
