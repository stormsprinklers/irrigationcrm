"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  PRESET_RANGE_LABELS,
  type ReportPresetRange,
  type ReportRangeInput,
} from "@/lib/reporting/date-range";

type ReportDateRangeControlProps = {
  value: ReportRangeInput;
  onChange: (next: ReportRangeInput) => void;
  label: string;
};

const PRESETS = Object.keys(PRESET_RANGE_LABELS) as ReportPresetRange[];

export function ReportDateRangeControl({ value, onChange, label }: ReportDateRangeControlProps) {
  const [open, setOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(
    value.preset === "custom" ? value.start : ""
  );
  const [draftEnd, setDraftEnd] = useState(value.preset === "custom" ? value.end : "");
  const [customError, setCustomError] = useState<string | null>(null);

  useEffect(() => {
    if (value.preset === "custom") {
      setDraftStart(value.start);
      setDraftEnd(value.end);
    }
  }, [value]);

  function selectPreset(preset: ReportPresetRange) {
    setCustomError(null);
    onChange({ preset });
    setOpen(false);
  }

  function applyCustomRange() {
    if (!draftStart || !draftEnd) {
      setCustomError("Choose a start and end date.");
      return;
    }
    if (draftStart > draftEnd) {
      setCustomError("Start date must be on or before end date.");
      return;
    }
    setCustomError(null);
    onChange({ preset: "custom", start: draftStart, end: draftEnd });
    setOpen(false);
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-sm font-medium"
        >
          {label}
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {PRESETS.map((preset) => (
          <DropdownMenuItem key={preset} onClick={() => selectPreset(preset)}>
            {PRESET_RANGE_LABELS[preset]}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <div
          className="space-y-3 p-3"
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <p className="text-sm font-medium">Custom range</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">From</label>
              <Input
                type="date"
                value={draftStart}
                onChange={(event) => {
                  setDraftStart(event.target.value);
                  setCustomError(null);
                }}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">To</label>
              <Input
                type="date"
                value={draftEnd}
                onChange={(event) => {
                  setDraftEnd(event.target.value);
                  setCustomError(null);
                }}
              />
            </div>
          </div>
          {customError ? <p className="text-xs text-destructive">{customError}</p> : null}
          <Button type="button" size="sm" className="w-full" onClick={applyCustomRange}>
            Apply range
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
