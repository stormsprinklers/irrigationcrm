"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { addWeeks, endOfWeek, format, startOfWeek, subWeeks } from "date-fns";
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
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
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

  const weekEnd = useMemo(
    () => endOfWeek(weekStart, { weekStartsOn: 0 }),
    [weekStart]
  );

  const weekLabel = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    return `${format(weekStart, "MMMM dd")}-${format(end, "dd, yyyy")}`;
  }, [weekStart]);

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
      const start = weekStart.toISOString();
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
  }, [weekStart, weekEnd, buildFilterQuery]);

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
        onPrevWeek={() => setWeekStart((d) => subWeeks(d, 1))}
        onNextWeek={() => setWeekStart((d) => addWeeks(d, 1))}
        onToday={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }))}
        onColorByChange={setColorBy}
        onFiltersChange={setFilters}
        onToggleFilters={() => setFiltersOpen((o) => !o)}
        onBulkAction={(action) => toast.message(`${action} — coming in a future release`)}
      />
      <div className="flex-1 overflow-auto">
        {loading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading schedule...</p>
        ) : (
          <WeekGrid jobs={jobs} weekStart={weekStart} colorBy={colorBy} />
        )}
      </div>
    </div>
  );
}
