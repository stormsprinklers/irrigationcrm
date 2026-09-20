"use client";

import { useEffect, useId, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isValid,
  isWithinInterval,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  PRESET_RANGE_LABELS,
  REPORTING_KPI_PRESETS,
  type ReportPresetRange,
  type ReportRangeInput,
} from "@/lib/reporting/date-range";

type ReportDateRangeControlProps = {
  value: ReportRangeInput;
  onChange: (next: ReportRangeInput) => void;
  label: string;
  /** Which presets to show. Defaults to classic reporting presets. */
  presets?: ReportPresetRange[];
  /** Show custom date range picker. Defaults to true. */
  allowCustom?: boolean;
};

type DateField = "start" | "end";

function parseDateValue(value: string) {
  if (!value) return null;
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : null;
}

function dateButtonLabel(value: string) {
  const parsed = parseDateValue(value);
  return parsed ? format(parsed, "MMM d, yyyy") : "Choose date";
}

function MiniRangeCalendar({
  id,
  month,
  activeField,
  rangeStart,
  rangeEnd,
  onMonthChange,
  onSelect,
}: {
  id: string;
  month: Date;
  activeField: DateField;
  rangeStart: string;
  rangeEnd: string;
  onMonthChange: (month: Date) => void;
  onSelect: (date: Date) => void;
}) {
  const monthStart = startOfMonth(month);
  const days = eachDayOfInterval({
    start: startOfWeek(monthStart),
    end: endOfWeek(endOfMonth(monthStart)),
  });
  const start = parseDateValue(rangeStart);
  const end = parseDateValue(rangeEnd);
  const hasValidRange = Boolean(start && end && start <= end);

  return (
    <div
      id={id}
      className="rounded-md border border-border bg-background p-2 shadow-sm"
    >
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onMonthChange(subMonths(monthStart, 1))}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-semibold">{format(monthStart, "MMMM yyyy")}</p>
        <button
          type="button"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onMonthChange(addMonths(monthStart, 1))}
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] font-medium text-muted-foreground">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
          <span key={day} className="py-1" aria-hidden="true">
            {day}
          </span>
        ))}
      </div>
      <div
        className="grid grid-cols-7 gap-0.5"
        role="grid"
        aria-label={`${activeField === "start" ? "Start" : "End"} date`}
      >
        {days.map((day) => {
          const isStart = Boolean(start && isSameDay(day, start));
          const isEnd = Boolean(end && isSameDay(day, end));
          const inRange = Boolean(
            hasValidRange && start && end && isWithinInterval(day, { start, end })
          );
          const isToday = isSameDay(day, new Date());
          const inMonth = isSameMonth(day, monthStart);

          return (
            <button
              key={day.toISOString()}
              type="button"
              role="gridcell"
              aria-label={format(day, "EEEE, MMMM d, yyyy")}
              aria-selected={activeField === "start" ? isStart : isEnd}
              onClick={() => onSelect(day)}
              className={cn(
                "relative flex h-8 w-8 items-center justify-center rounded-md text-xs transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                !inMonth && "text-muted-foreground/45",
                inRange && !isStart && !isEnd && "bg-primary/10 text-foreground",
                (isStart || isEnd) && "bg-primary font-semibold text-primary-foreground",
                !isStart && !isEnd && "hover:bg-muted hover:text-foreground",
                isToday && !isStart && !isEnd && "ring-1 ring-inset ring-primary/60"
              )}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="mt-2 w-full rounded-md px-2 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onSelect(new Date())}
      >
        Choose today
      </button>
    </div>
  );
}

export function ReportDateRangeControl({
  value,
  onChange,
  label,
  presets = REPORTING_KPI_PRESETS,
  allowCustom = true,
}: ReportDateRangeControlProps) {
  const [open, setOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(
    value.preset === "custom" ? value.start : ""
  );
  const [draftEnd, setDraftEnd] = useState(value.preset === "custom" ? value.end : "");
  const [customError, setCustomError] = useState<string | null>(null);
  const [activeField, setActiveField] = useState<DateField | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const calendarId = useId();

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

  function openCalendar(field: DateField) {
    const selected = parseDateValue(field === "start" ? draftStart : draftEnd);
    setCalendarMonth(startOfMonth(selected ?? new Date()));
    setActiveField(field);
    setCustomError(null);
  }

  function selectCalendarDate(date: Date) {
    const next = format(date, "yyyy-MM-dd");
    setCustomError(null);
    if (activeField === "start") {
      setDraftStart(next);
      if (draftEnd && next > draftEnd) setDraftEnd("");
      setCalendarMonth(startOfMonth(date));
      setActiveField("end");
      return;
    }
    if (activeField === "end") {
      if (draftStart && next < draftStart) {
        setCustomError("End date must be on or after the start date.");
        return;
      }
      setDraftEnd(next);
      setActiveField(null);
    }
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setActiveField(null);
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {label}
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {presets.map((preset) => (
          <DropdownMenuItem key={preset} onClick={() => selectPreset(preset)}>
            {PRESET_RANGE_LABELS[preset]}
          </DropdownMenuItem>
        ))}
        {allowCustom ? (
          <>
            <DropdownMenuSeparator />
            <div
              className="space-y-3 p-3"
              onPointerDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === "Escape" && activeField) {
                  event.preventDefault();
                  event.stopPropagation();
                  setActiveField(null);
                  return;
                }
                event.stopPropagation();
              }}
            >
              <p className="text-sm font-medium">Custom range</p>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { field: "start", label: "From", value: draftStart },
                    { field: "end", label: "To", value: draftEnd },
                  ] as const
                ).map((item) => (
                  <div key={item.field}>
                    <label className="mb-1 block text-xs text-muted-foreground">
                      {item.label}
                    </label>
                    <button
                      type="button"
                      className={cn(
                        "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-2 text-left text-xs shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        activeField === item.field && "border-primary ring-1 ring-primary"
                      )}
                      onClick={() => openCalendar(item.field)}
                      aria-expanded={activeField === item.field}
                      aria-controls={calendarId}
                    >
                      <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className={cn(!item.value && "text-muted-foreground")}>
                        {dateButtonLabel(item.value)}
                      </span>
                    </button>
                  </div>
                ))}
              </div>
              {activeField ? (
                <MiniRangeCalendar
                  id={calendarId}
                  month={calendarMonth}
                  activeField={activeField}
                  rangeStart={draftStart}
                  rangeEnd={draftEnd}
                  onMonthChange={setCalendarMonth}
                  onSelect={selectCalendarDate}
                />
              ) : null}
              {customError ? <p className="text-xs text-destructive">{customError}</p> : null}
              <Button type="button" size="sm" className="w-full" onClick={applyCustomRange}>
                Apply range
              </Button>
            </div>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
