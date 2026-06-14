"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDays,
  addWeeks,
  endOfWeek,
  format,
  startOfDay,
  startOfWeek,
  subDays,
  subWeeks,
} from "date-fns";
import { toast } from "sonner";
import { ScheduleToolbar } from "./ScheduleToolbar";
import { WeekGrid } from "./WeekGrid";
import {
  DEFAULT_SCHEDULE_FILTERS,
  type ColorByMode,
  type ScheduleFilters,
  type ScheduleJobDTO,
} from "@/lib/schedule/types";

type FilterOptions = {
  serviceAreas: { id: string; name: string; color: string }[];
  employees: { id: string; name: string }[];
  crews: { id: string; name: string; color: string }[];
};

export function ScheduleView() {
  const [viewMode, setViewMode] = useState<"week" | "day">("week");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [focusDay, setFocusDay] = useState(() => startOfDay(new Date()));
  const [jobs, setJobs] = useState<ScheduleJobDTO[]>([]);
  const [colorBy, setColorBy] = useState<ColorByMode>("area");
  const [filters, setFilters] = useState<ScheduleFilters>(DEFAULT_SCHEDULE_FILTERS);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    serviceAreas: [],
    employees: [],
    crews: [],
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [summary, setSummary] = useState({
    revenueFormatted: "$0.00",
    scheduledHoursFormatted: "0h",
  });
  const [loading, setLoading] = useState(true);

  const weekEnd = useMemo(() => {
    if (viewMode === "day") {
      const end = new Date(focusDay);
      end.setHours(23, 59, 59, 999);
      return end;
    }
    return endOfWeek(weekStart, { weekStartsOn: 0 });
  }, [weekStart, focusDay, viewMode]);

  const rangeStart = viewMode === "day" ? focusDay : weekStart;

  const weekLabel = useMemo(() => {
    if (viewMode === "day") return format(focusDay, "EEEE, MMMM d, yyyy");
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    return `${format(weekStart, "MMMM dd")}-${format(end, "dd, yyyy")}`;
  }, [weekStart, focusDay, viewMode]);

  const activeFilterCount =
    filters.serviceAreaIds.length +
    filters.userIds.length +
    filters.crewIds.length +
    filters.divisions.length;

  const buildFilterQuery = useCallback(
    (base: URLSearchParams) => {
      filters.serviceAreaIds.forEach((id) => base.append("serviceAreaIds", id));
      filters.userIds.forEach((id) => base.append("userIds", id));
      filters.crewIds.forEach((id) => base.append("crewIds", id));
      filters.divisions.forEach((d) => base.append("divisions", d));
    },
    [filters]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const start = rangeStart.toISOString();
      const end = new Date(weekEnd.getTime() + 1).toISOString();

      const jobsParams = new URLSearchParams({ start, end });
      buildFilterQuery(jobsParams);

      const summaryParams = new URLSearchParams({ start, end });

      const [jobsRes, summaryRes, filtersRes] = await Promise.all([
        fetch(`/api/schedule/jobs?${jobsParams}`),
        fetch(`/api/schedule/summary?${summaryParams}`),
        fetch("/api/schedule/filters"),
      ]);

      if (jobsRes.ok) setJobs(await jobsRes.json());
      if (summaryRes.ok) {
        const data = await summaryRes.json();
        setSummary({
          revenueFormatted: data.revenueFormatted,
          scheduledHoursFormatted: data.scheduledHoursFormatted,
        });
      }
      if (filtersRes.ok) {
        const data = await filtersRes.json();
        setFilterOptions({
          serviceAreas: data.serviceAreas,
          employees: data.employees,
          crews: data.crews,
        });
      }
    } catch {
      toast.error("Failed to load schedule");
    } finally {
      setLoading(false);
    }
  }, [rangeStart, weekEnd, buildFilterQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">
      <ScheduleToolbar
        weekLabel={weekLabel}
        weeklyRevenue={summary.revenueFormatted}
        weeklyScheduledHours={summary.scheduledHoursFormatted}
        colorBy={colorBy}
        filters={filters}
        filterOptions={filterOptions}
        filtersOpen={filtersOpen}
        activeFilterCount={activeFilterCount}
        onPrevWeek={() => {
          if (viewMode === "day") setFocusDay((d) => subDays(d, 1));
          else setWeekStart((d) => subWeeks(d, 1));
        }}
        onNextWeek={() => {
          if (viewMode === "day") setFocusDay((d) => addDays(d, 1));
          else setWeekStart((d) => addWeeks(d, 1));
        }}
        onToday={() => {
          const today = startOfDay(new Date());
          setFocusDay(today);
          setWeekStart(startOfWeek(today, { weekStartsOn: 0 }));
        }}
        viewMode={viewMode}
        onViewModeChange={(mode) => {
          setViewMode(mode);
          if (mode === "day") setFocusDay(startOfDay(new Date()));
        }}
        onColorByChange={setColorBy}
        onFiltersChange={setFilters}
        onToggleFilters={() => setFiltersOpen((o) => !o)}
        onBulkAction={(action) => toast.message(`${action} — coming in a future release`)}
      />
      <div className="flex-1 overflow-auto">
        {loading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading schedule...</p>
        ) : (
          <WeekGrid
            jobs={jobs}
            weekStart={viewMode === "day" ? focusDay : weekStart}
            colorBy={colorBy}
            dayCount={viewMode === "day" ? 1 : 7}
          />
        )}
      </div>
    </div>
  );
}
