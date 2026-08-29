"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { billedSegmentLengthFt, segmentPitchResolved } from "@/lib/holiday-lighting/pitch-match";
import {
  addSegmentToStrand,
  billedStrandLengthFt,
  combineSegmentsIntoStrand,
  dissolveStrand,
  removeSegmentFromStrand,
  renameStrand,
  segmentIdsInAnyStrand,
} from "@/lib/holiday-lighting/strands";
import type { HolidayMeasurements } from "@/lib/holiday-lighting/types";
import { cn } from "@/lib/utils";

type Props = {
  measurements: HolidayMeasurements;
  onChange: (next: HolidayMeasurements) => void;
  selectedStrandId: string | null;
  onSelectStrand: (id: string | null) => void;
};

export function StrandBuilder({
  measurements,
  onChange,
  selectedStrandId,
  onSelectStrand,
}: Props) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const resolved = useMemo(
    () =>
      measurements.segments.filter(
        (s) => s.kind === "roofline" && segmentPitchResolved(s)
      ),
    [measurements.segments]
  );

  const grouped = segmentIdsInAnyStrand(measurements);
  const available = resolved.filter((s) => !grouped.has(s.id));
  const strands = measurements.strands ?? [];

  if (resolved.length < 1) {
    return null;
  }

  function togglePick(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function combine() {
    const ids = [...picked];
    if (ids.length < 2) return;
    const next = combineSegmentsIntoStrand(measurements, ids);
    onChange(next);
    const created = (next.strands ?? []).at(-1);
    if (created) {
      onSelectStrand(created.id);
      setExpandedIds((prev) => new Set(prev).add(created.id));
    }
    setPicked(new Set());
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-white p-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-foreground">Strands</p>
      </div>

      {available.length > 0 ? (
        <div className="space-y-1">
          <p className="text-muted-foreground">Ungrouped</p>
          <ul className="max-h-28 space-y-0.5 overflow-y-auto">
            {available.map((seg) => {
              const checked = picked.has(seg.id);
              return (
                <li key={seg.id}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-muted",
                      checked && "bg-primary/10"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePick(seg.id)}
                      className="rounded border-input"
                    />
                    <span className="min-w-0 flex-1 truncate">{seg.label}</span>
                    <span className="font-mono text-muted-foreground">
                      {billedSegmentLengthFt(seg).toFixed(1)} ft
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <Button
            type="button"
            size="sm"
            className="h-7"
            disabled={picked.size < 2}
            onClick={combine}
          >
            Combine into strand
          </Button>
        </div>
      ) : null}

      {strands.length > 0 ? (
        <ul className="space-y-2 border-t pt-2">
          {strands.map((strand) => {
            const members = strand.segmentIds
              .map((id) => measurements.segments.find((s) => s.id === id))
              .filter(Boolean);
            const selected = selectedStrandId === strand.id;
            const expanded = expandedIds.has(strand.id) || selected;
            const total = billedStrandLengthFt(strand, measurements.segments);
            return (
              <li
                key={strand.id}
                className={cn(
                  "rounded-md border px-2 py-1.5",
                  selected ? "border-primary bg-primary/5" : "border-border"
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left font-medium hover:underline"
                    onClick={() => {
                      toggleExpanded(strand.id);
                      onSelectStrand(selected && expanded ? null : strand.id);
                    }}
                    aria-expanded={expanded}
                  >
                    {expanded ? (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate">
                      {selected ? "Selected · " : ""}
                      {strand.label}
                    </span>
                    <span className="shrink-0 font-mono font-normal text-muted-foreground">
                      {total.toFixed(1)} ft
                    </span>
                    <span className="shrink-0 text-[10px] font-normal text-muted-foreground">
                      · {members.length} segment{members.length === 1 ? "" : "s"}
                    </span>
                  </button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-destructive hover:text-destructive"
                    onClick={() => {
                      onChange(dissolveStrand(measurements, strand.id));
                      if (selectedStrandId === strand.id) onSelectStrand(null);
                      setExpandedIds((prev) => {
                        const next = new Set(prev);
                        next.delete(strand.id);
                        return next;
                      });
                    }}
                  >
                    Dissolve
                  </Button>
                </div>

                {expanded ? (
                  <div className="mt-1.5 space-y-1 border-t border-border/60 pt-1.5">
                    <Input
                      className="h-7 text-xs"
                      value={strand.label}
                      onChange={(e) =>
                        onChange(renameStrand(measurements, strand.id, e.target.value))
                      }
                      onFocus={() => onSelectStrand(strand.id)}
                    />
                    <ul className="space-y-0.5">
                      {members.map((seg) =>
                        seg ? (
                          <li
                            key={seg.id}
                            className="flex items-center justify-between gap-2 text-muted-foreground"
                          >
                            <span className="truncate">{seg.label}</span>
                            <span className="flex items-center gap-1">
                              <span className="font-mono">
                                {billedSegmentLengthFt(seg).toFixed(1)} ft
                              </span>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-6 px-1"
                                onClick={() =>
                                  onChange(
                                    removeSegmentFromStrand(measurements, strand.id, seg.id)
                                  )
                                }
                              >
                                Remove
                              </Button>
                            </span>
                          </li>
                        ) : null
                      )}
                    </ul>
                    {available.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {available.map((seg) => (
                          <Button
                            key={seg.id}
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 px-1.5 text-[10px]"
                            onClick={() => {
                              onChange(addSegmentToStrand(measurements, strand.id, seg.id));
                              onSelectStrand(strand.id);
                              setExpandedIds((prev) => new Set(prev).add(strand.id));
                            }}
                          >
                            + {seg.label}
                          </Button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
