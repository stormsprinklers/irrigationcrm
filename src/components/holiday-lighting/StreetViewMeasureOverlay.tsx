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

  const matchableSegments = measurements.segments.filter(
    (s) => s.kind === "roofline" || s.kind === "garland"
  );

  // Auto-select a matchable strand so the photo is immediately drawable.
  useEffect(() => {
    const matchable = measurements.segments.filter(
      (s) => s.kind === "roofline" || s.kind === "garland"
    );
    if (selectedSegmentId && matchable.some((s) => s.id === selectedSegmentId)) {
      return;
    }
    const streetTraces = measurements.streetTraces ?? [];
    const firstUnmatched = matchable.find(
      (seg) => !streetTraces.some((t) => t.satelliteSegmentId === seg.id)
    );
    const nextId = firstUnmatched?.id ?? matchable[0]?.id ?? null;
    if (nextId !== selectedSegmentId) onSelectSegment(nextId);
  }, [
    measurements.segments,
    measurements.streetTraces,
    onSelectSegment,
    selectedSegmentId,
  ]);

  const draftHint = !selectedSegmentId
    ? "Select a satellite segment above, then click on the photo."
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
    <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-2">
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

      <ul className="relative z-20 max-h-40 space-y-1 overflow-y-auto rounded-md border border-border bg-white p-2 text-xs shadow-sm">
        {matchableSegments.length === 0 ? (
          <li className="text-muted-foreground">Draw a roofline on the satellite map first.</li>
        ) : (
          matchableSegments.map((seg) => {
            const matched = traces.some((t) => t.satelliteSegmentId === seg.id);
            const horizontal = seg.horizontalLengthFt ?? seg.lengthFt;
            const selected = selectedSegmentId === seg.id;
            return (
              <li key={seg.id}>
                <div
                  className={cn(
                    "flex items-start gap-1 rounded-md border px-1 py-0.5 transition-colors",
                    selected
                      ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                      : "border-transparent hover:bg-muted"
                  )}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 px-1 py-1 text-left"
                    onPointerDown={(e) => {
                      // Prefer pointerdown so Google Maps panes can't steal the click.
                      e.stopPropagation();
                      onSelectSegment(seg.id);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectSegment(seg.id);
                    }}
                  >
                    <span className="flex justify-between gap-2 font-medium">
                      <span className="truncate">{seg.label}</span>
                      <span
                        className={cn(
                          "shrink-0",
                          matched ? "text-emerald-700" : "text-amber-700"
                        )}
                      >
                        {selected ? "Selected · " : ""}
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
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="mt-0.5 h-7 shrink-0 px-2 text-destructive hover:text-destructive"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange({
                        ...measurements,
                        segments: measurements.segments.filter((s) => s.id !== seg.id),
                        streetTraces: (measurements.streetTraces ?? []).filter(
                          (t) => t.satelliteSegmentId !== seg.id
                        ),
                      });
                      if (selectedSegmentId === seg.id) onSelectSegment(null);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            );
          })
        )}
      </ul>

      <div
        className={cn(
          "relative z-0 w-full overflow-hidden rounded-md border border-border bg-muted",
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
    </div>
  );
}
