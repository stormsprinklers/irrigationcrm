"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isWithinInterval,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronDown, ChevronLeft, ChevronRight, Pencil, Users, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ScheduleFilters } from "@/lib/schedule/types";
import { scheduleCrewColumnId } from "@/lib/schedule/columns";

type FilterOptions = {
  serviceAreas: { id: string; name: string; color: string }[];
  employees: { id: string; name: string; color?: string | null; photoUrl?: string | null }[];
  crews: { id: string; name: string; color: string; photoUrl?: string | null }[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  weekStart: Date;
  onWeekChange: (weekStart: Date) => void;
  filters: ScheduleFilters;
  onFiltersChange: (filters: ScheduleFilters) => void;
  options: FilterOptions;
  showUnassigned: boolean;
  onShowUnassignedChange: (show: boolean) => void;
  hiddenUserIds: string[];
  onHiddenUserIdsChange: (ids: string[]) => void;
  onOpenTeamSchedule?: () => void;
};

export function ScheduleFilterSidebar({
  open,
  onClose,
  weekStart,
  onWeekChange,
  filters,
  onFiltersChange,
  options,
  showUnassigned,
  onShowUnassignedChange,
  hiddenUserIds,
  onHiddenUserIdsChange,
  onOpenTeamSchedule,
}: Props) {
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(weekStart));
  const [areaSearch, setAreaSearch] = useState("");
  const [employeesOpen, setEmployeesOpen] = useState(true);
  const [areasOpen, setAreasOpen] = useState(true);

  const weekEnd = useMemo(
    () => endOfWeek(weekStart, { weekStartsOn: 0 }),
    [weekStart]
  );

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(calendarMonth);
    const monthEnd = endOfMonth(calendarMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [calendarMonth]);

  const filteredAreas = useMemo(() => {
    const q = areaSearch.trim().toLowerCase();
    if (!q) return options.serviceAreas;
    return options.serviceAreas.filter((area) => area.name.toLowerCase().includes(q));
  }, [areaSearch, options.serviceAreas]);

  const crewColumnIds = useMemo(
    () => options.crews.map((crew) => scheduleCrewColumnId(crew.id)),
    [options.crews]
  );
  const allColumnIds = useMemo(
    () => [...crewColumnIds, ...options.employees.map((e) => e.id)],
    [crewColumnIds, options.employees]
  );
  const visibleColumnCount = allColumnIds.filter((id) => !hiddenUserIds.includes(id)).length;
  const allEmployeesVisible =
    hiddenUserIds.length === 0 &&
    visibleColumnCount === allColumnIds.length;

  if (!open) return null;

  return (
    <aside
      className={cn(
        "flex w-72 shrink-0 flex-col border-r border-border bg-card",
        "fixed inset-y-0 left-0 z-50 shadow-lg lg:relative lg:shadow-none"
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3 lg:hidden">
        <h2 className="font-semibold">Schedule filters</h2>
        <button type="button" onClick={onClose} className="rounded p-1 hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-6">
          <button
            type="button"
            onClick={() => {
              onOpenTeamSchedule?.();
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded-md border border-border px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-muted/60"
          >
            <Users className="h-4 w-4 text-primary" />
            Team schedules
          </button>
          <p className="mt-1 px-1 text-[11px] text-muted-foreground">
            Work days, time off, and request approvals
          </p>
        </div>

        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              className="rounded p-1 hover:bg-muted"
              onClick={() => setCalendarMonth((m) => subMonths(m, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold">{format(calendarMonth, "MMMM yyyy")}</span>
            <button
              type="button"
              className="rounded p-1 hover:bg-muted"
              onClick={() => setCalendarMonth((m) => addMonths(m, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-muted-foreground">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
              <span key={d} className="py-1 font-medium">
                {d}
              </span>
            ))}
            {calendarDays.map((day) => {
              const inMonth = isSameMonth(day, calendarMonth);
              const inSelectedWeek = isWithinInterval(day, { start: weekStart, end: weekEnd });
              const isToday = isSameDay(day, new Date());

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => {
                    onWeekChange(startOfWeek(day, { weekStartsOn: 0 }));
                    setCalendarMonth(startOfMonth(day));
                  }}
                  className={cn(
                    "mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs transition-colors",
                    !inMonth && "text-muted-foreground/40",
                    inSelectedWeek && !isToday && "bg-primary/10 text-primary",
                    isToday && "bg-primary font-semibold text-primary-foreground",
                    !isToday && !inSelectedWeek && "hover:bg-muted"
                  )}
                >
                  {format(day, "d")}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-4">
          <button
            type="button"
            className="mb-2 flex w-full items-center justify-between text-sm font-semibold"
            onClick={() => setAreasOpen((o) => !o)}
          >
            <span className="flex items-center gap-2">
              Areas
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", areasOpen && "rotate-180")} />
          </button>
          {areasOpen ? (
            <div className="space-y-2">
              <Input
                placeholder="Filter by name or tag"
                value={areaSearch}
                onChange={(e) => setAreaSearch(e.target.value)}
                className="h-8 text-xs"
              />
              <div className="max-h-40 space-y-2 overflow-y-auto">
                {filteredAreas.map((area) => (
                  <label key={area.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={
                        filters.serviceAreaIds.length === 0 ||
                        filters.serviceAreaIds.includes(area.id)
                      }
                      onCheckedChange={(checked) => {
                        const allIds = options.serviceAreas.map((a) => a.id);
                        const current =
                          filters.serviceAreaIds.length === 0 ? allIds : filters.serviceAreaIds;
                        const next = checked
                          ? [...new Set([...current, area.id])]
                          : current.filter((id) => id !== area.id);
                        onFiltersChange({
                          ...filters,
                          serviceAreaIds:
                            next.length === allIds.length || next.length === 0 ? [] : next,
                        });
                      }}
                    />
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: area.color }}
                    />
                    <span className="truncate">{area.name}</span>
                  </label>
                ))}
                {filteredAreas.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No areas match</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div>
          <button
            type="button"
            className="mb-2 flex w-full items-center justify-between text-sm font-semibold"
            onClick={() => setEmployeesOpen((o) => !o)}
          >
            <span className="flex items-center gap-2">
              <Checkbox
                checked={allEmployeesVisible && showUnassigned}
                onCheckedChange={(checked) => {
                  if (checked) {
                    onHiddenUserIdsChange([]);
                    onShowUnassignedChange(true);
                  } else {
                    onHiddenUserIdsChange(allColumnIds);
                    onShowUnassignedChange(false);
                  }
                }}
                onClick={(e) => e.stopPropagation()}
              />
              Columns
            </span>
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", employeesOpen && "rotate-180")}
            />
          </button>
          {employeesOpen ? (
            <div className="space-y-2 pl-1">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={showUnassigned}
                  onCheckedChange={(checked) => onShowUnassignedChange(checked === true)}
                />
                <span>Unassigned</span>
              </label>
              {options.crews.map((crew) => {
                const columnId = scheduleCrewColumnId(crew.id);
                const visible = !hiddenUserIds.includes(columnId);
                return (
                  <label key={columnId} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={visible}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          onHiddenUserIdsChange(hiddenUserIds.filter((id) => id !== columnId));
                        } else {
                          onHiddenUserIdsChange([...hiddenUserIds, columnId]);
                        }
                      }}
                    />
                    <span className="truncate">{crew.name}</span>
                    <span className="text-[10px] text-muted-foreground">Crew</span>
                  </label>
                );
              })}
              {options.employees.map((emp) => {
                const visible = !hiddenUserIds.includes(emp.id);
                return (
                  <label key={emp.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={visible}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          onHiddenUserIdsChange(hiddenUserIds.filter((id) => id !== emp.id));
                        } else {
                          onHiddenUserIdsChange([...hiddenUserIds, emp.id]);
                        }
                      }}
                    />
                    <span className="truncate">{emp.name}</span>
                  </label>
                );
              })}
              {options.crews.length === 0 && options.employees.length === 0 ? (
                <p className="text-xs text-muted-foreground">No schedule columns</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
