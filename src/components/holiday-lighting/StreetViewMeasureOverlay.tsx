"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  midpoint,
  previewSegmentFromPoints,
  upsertStreetTrace,
} from "@/lib/holiday-lighting/pitch-match";
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

function pathD(pts: StreetViewNormPoint[]) {
  return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

/** Roof diagonals for a gable: left → peak → right. */
function gableRoofPoints(left: StreetViewNormPoint, right: StreetViewNormPoint, peak: StreetViewNormPoint) {
  return [left, peak, right];
}

export function StreetViewMeasureOverlay({
  imageUrl,
  measurements,
  selectedSegmentId,
  onSelectSegment,
  onChange,
}: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [drawMode, setDrawMode] = useState<DrawMode>("gable");
  const [draft, setDraft] = useState<StreetViewNormPoint[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [aspect, setAspect] = useState(4 / 3);
  const needed = drawMode === "gable" ? 3 : 2;

  const traces = measurements.streetTraces ?? [];
  const selectedTrace = traces.find((t) => t.satelliteSegmentId === selectedSegmentId);
  const selectedSegment = measurements.segments.find((s) => s.id === selectedSegmentId);

  useEffect(() => {
    setDraft([]);
    setReviewing(false);
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
    if (!selectedSegmentId || reviewing) return;
    const pt = toNorm(e.clientX, e.clientY);
    if (!pt) return;
    const next = [...draft, pt];
    if (next.length >= needed) {
      setDraft(next.slice(0, needed));
      setReviewing(true);
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
    setReviewing(false);
  }

  function redoDraft() {
    setDraft([]);
    setReviewing(false);
  }

  function approveMatch() {
    if (!selectedSegmentId || draft.length < needed) return;
    onChange(upsertStreetTrace(measurements, selectedSegmentId, draft.slice(0, needed)));
    setDraft([]);
    setReviewing(false);
  }

  const matchableSegments = measurements.segments.filter((s) => s.kind === "roofline");

  useEffect(() => {
    const matchable = measurements.segments.filter((s) => s.kind === "roofline");
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

  const preview = useMemo(() => {
    if (!reviewing || !selectedSegment || draft.length < needed) return null;
    return previewSegmentFromPoints(selectedSegment, draft.slice(0, needed));
  }, [reviewing, selectedSegment, draft, needed]);

  const draftHint = !selectedSegmentId
    ? "Select a satellite roofline above, then mark it on the photo."
    : reviewing
      ? "Review the constructed roof edges, then approve to update the billed length."
      : drawMode === "single"
        ? draft.length === 0
          ? "1. Click one end of the roof edge."
          : "2. Click the other end of the roof edge."
        : draft.length === 0
          ? "1. Click one end of the gable (eave)."
          : draft.length === 1
            ? "2. Click the other end of the gable (same span as the satellite segment)."
            : "3. Click the peak tip — a rise line is drawn from the center of the eave span.";

  const horizontal = selectedSegment
    ? selectedSegment.horizontalLengthFt ?? selectedSegment.lengthFt
    : 0;

  return (
    <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <TooltipProvider delayDuration={200}>
          <div className="flex items-center gap-2 rounded-md border border-border bg-white px-2 py-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "text-xs font-medium transition-colors",
                    drawMode === "single" ? "text-foreground" : "text-muted-foreground"
                  )}
                  onClick={() => setDrawMode("single")}
                >
                  Single slope
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Mark both ends of one roof edge, then approve the true length.
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Switch
                    checked={drawMode === "gable"}
                    onCheckedChange={(checked) => setDrawMode(checked ? "gable" : "single")}
                    aria-label="Gable roof mode"
                  />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Gable: mark both eaves (same as satellite), then the peak. Roof diagonals are
                constructed for you to approve.
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "text-xs font-medium transition-colors",
                    drawMode === "gable" ? "text-foreground" : "text-muted-foreground"
                  )}
                  onClick={() => setDrawMode("gable")}
                >
                  Gable
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Eave → eave (horizontal span), then peak. Diagonals left–peak–right become the true
                roof edges.
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
        {selectedSegmentId && selectedTrace ? (
          <Button type="button" size="sm" variant="ghost" onClick={clearTrace}>
            Clear match
          </Button>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">{draftHint}</p>

      {preview ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5 text-xs">
          <span className="font-medium text-foreground">
            Plan {horizontal.toFixed(1)} ft → true{" "}
            {preview.lengthFtRight != null
              ? `${preview.lengthFt.toFixed(1)}+${preview.lengthFtRight.toFixed(1)} = ${(
                  preview.lengthFt + preview.lengthFtRight
                ).toFixed(1)}`
              : preview.lengthFt.toFixed(1)}{" "}
            ft
          </span>
          <span className="text-muted-foreground">
            {preview.pitchDeg != null ? `${preview.pitchDeg}°` : ""}
            {preview.pitchDegRight != null ? ` / ${preview.pitchDegRight}°` : ""}
            {preview.riseFt != null ? ` · rise ${preview.riseFt.toFixed(1)} ft` : ""}
          </span>
          <div className="ml-auto flex gap-1">
            <Button type="button" size="sm" variant="outline" className="h-7" onClick={redoDraft}>
              Redo
            </Button>
            <Button type="button" size="sm" className="h-7" onClick={approveMatch}>
              Approve length
            </Button>
          </div>
        </div>
      ) : null}

      <ul className="relative z-20 max-h-40 space-y-1 overflow-y-auto rounded-md border border-border bg-white p-2 text-xs shadow-sm">
        {matchableSegments.length === 0 ? (
          <li className="text-muted-foreground">Draw a roofline on the satellite map first.</li>
        ) : (
          matchableSegments.map((seg) => {
            const matched = traces.some((t) => t.satelliteSegmentId === seg.id);
            const plan = seg.horizontalLengthFt ?? seg.lengthFt;
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
                        {matched ? "Approved" : "Needs pitch"}
                      </span>
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      Plan {plan.toFixed(1)} ft
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
          selectedSegmentId && !reviewing ? "cursor-crosshair" : "cursor-default"
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
            const stroke = active ? "#F17388" : "#4C9BC8";
            if (pts.length >= 3) {
              const [left, right, peak] = pts;
              const mid = midpoint(left!, right!);
              return (
                <g key={trace.id}>
                  <path
                    d={pathD([left!, right!])}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={0.006}
                    strokeOpacity={0.45}
                  />
                  <path
                    d={pathD([mid, peak!])}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={0.005}
                    strokeDasharray="0.015 0.012"
                    strokeOpacity={0.55}
                  />
                  <path
                    d={pathD(gableRoofPoints(left!, right!, peak!))}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={0.01}
                  />
                </g>
              );
            }
            return (
              <path
                key={trace.id}
                d={pathD(pts)}
                fill="none"
                stroke={stroke}
                strokeWidth={0.01}
              />
            );
          })}

          {draft.length > 0 ? (
            <g>
              {/* Gable: eave span */}
              {drawMode === "gable" && draft.length >= 2 ? (
                <path
                  d={pathD([draft[0]!, draft[1]!])}
                  fill="none"
                  stroke="#E6C27A"
                  strokeWidth={0.008}
                  strokeDasharray={reviewing ? undefined : "0.02 0.015"}
                />
              ) : null}

              {/* Gable: rise from center to peak + constructed diagonals */}
              {drawMode === "gable" && draft.length >= 3 ? (
                <>
                  <path
                    d={pathD([midpoint(draft[0]!, draft[1]!), draft[2]!])}
                    fill="none"
                    stroke="#E6C27A"
                    strokeWidth={0.006}
                    strokeDasharray="0.015 0.012"
                  />
                  <path
                    d={pathD(gableRoofPoints(draft[0]!, draft[1]!, draft[2]!))}
                    fill="none"
                    stroke="#F17388"
                    strokeWidth={0.012}
                  />
                </>
              ) : null}

              {/* Single slope edge */}
              {drawMode === "single" && draft.length >= 2 ? (
                <path
                  d={pathD([draft[0]!, draft[1]!])}
                  fill="none"
                  stroke={reviewing ? "#F17388" : "#E6C27A"}
                  strokeWidth={reviewing ? 0.012 : 0.01}
                  strokeDasharray={reviewing ? undefined : "0.02 0.015"}
                />
              ) : null}

              {/* In-progress single first point / gable first point */}
              {drawMode === "single" && draft.length === 1 ? (
                <circle cx={draft[0]!.x} cy={draft[0]!.y} r={0.012} fill="#E6C27A" />
              ) : null}
              {drawMode === "gable" && draft.length === 1 ? (
                <circle cx={draft[0]!.x} cy={draft[0]!.y} r={0.012} fill="#E6C27A" />
              ) : null}

              {draft.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={0.011}
                  fill={i === 2 ? "#F17388" : "#E6C27A"}
                />
              ))}
            </g>
          ) : null}
        </svg>
      </div>
    </div>
  );
}
