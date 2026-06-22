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
import { ScheduleFilterSidebar } from "./ScheduleFilterSidebar";
import { ScheduleToolbar } from "./ScheduleToolbar";
import { TeamSchedulePanel } from "./TeamSchedulePanel";
import { WeekGrid, type TechColumn } from "./WeekGrid";
import {
  DEFAULT_SCHEDULE_FILTERS,
  type ColorByMode,
  type ScheduleFilters,
  type ScheduleJobDTO,
} from "@/lib/schedule/types";

type FilterOptions = {
  serviceAreas: { id: string; name: string; color: string }[];
  employees: { id: string; name: string; color?: string | null; photoUrl?: string | null }[];
  crews: { id: string; name: string; color: string }[];
};

export function ScheduleView() {
  const [viewMode, setViewMode] = useState<"week" | "day">("week");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [focusDay, setFocusDay] = useState(() => startOfDay(new Date()));
  const [jobs, setJobs] = useState<ScheduleJobDTO[]>([]);
  const [colorBy, setColorBy] = useState<ColorByMode>("technician");
  const [filters, setFilters] = useState<ScheduleFilters>(DEFAULT_SCHEDULE_FILTERS);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    serviceAreas: [],
    employees: [],
    crews: [],
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<"jobs" | "team">("jobs");
  const [showUnassigned, setShowUnassigned] = useState(true);
  const [hiddenUserIds, setHiddenUserIds] = useState<string[]>([]);
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
    return `${format(weekStart, "MMMM d")}-${format(end, "d, yyyy")}`;
  }, [weekStart, focusDay, viewMode]);

  const techColumns = useMemo((): TechColumn[] => {
    const cols: TechColumn[] = [];
    if (showUnassigned) {
      cols.push({ id: "__unassigned__", name: "Unassigned", isUnassigned: true });
    }
    for (const employee of filterOptions.employees) {
      if (!hiddenUserIds.includes(employee.id)) {
        cols.push({
          id: employee.id,
          name: employee.name,
          color: employee.color,
          photoUrl: employee.photoUrl,
        });
      }
    }
    return cols;
  }, [filterOptions.employees, hiddenUserIds, showUnassigned]);

  const visibleJobs = useMemo(() => {
    return jobs.filter((job) => {
      if (!showUnassigned && !job.assignedUser) return false;
      if (job.assignedUser && hiddenUserIds.includes(job.assignedUser.id)) return false;
      return true;
    });
  }, [jobs, showUnassigned, hiddenUserIds]);

  const buildFilterQuery = useCallback(
    (base: URLSearchParams) => {
      filters.serviceAreaIds.forEach((id) => base.append("serviceAreaIds", id));
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
      buildFilterQuery(summaryParams);

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
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <ScheduleToolbar
        weekLabel={weekLabel}
        weeklyRevenue={summary.revenueFormatted}
        weeklyScheduledHours={summary.scheduledHoursFormatted}
        colorBy={colorBy}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
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
      />

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {sidebarOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            aria-label="Close schedule filters"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}

        <ScheduleFilterSidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          weekStart={viewMode === "day" ? startOfWeek(focusDay, { weekStartsOn: 0 }) : weekStart}
          onWeekChange={(nextWeekStart) => {
            setWeekStart(nextWeekStart);
            setFocusDay(nextWeekStart);
            setViewMode("week");
          }}
          filters={filters}
          onFiltersChange={setFilters}
          options={filterOptions}
          showUnassigned={showUnassigned}
          onShowUnassignedChange={setShowUnassigned}
          hiddenUserIds={hiddenUserIds}
          onHiddenUserIdsChange={setHiddenUserIds}
          onOpenTeamSchedule={() => setPanelMode("team")}
        />

        {panelMode === "team" ? (
          <TeamSchedulePanel
            weekStart={viewMode === "day" ? startOfWeek(focusDay, { weekStartsOn: 0 }) : weekStart}
            onWeekChange={(nextWeekStart) => {
              setWeekStart(nextWeekStart);
              setFocusDay(nextWeekStart);
              setViewMode("week");
            }}
            employees={filterOptions.employees}
            onClose={() => setPanelMode("jobs")}
          />
        ) : loading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Loading schedule...
          </div>
        ) : (
          <WeekGrid
            jobs={visibleJobs}
            weekStart={viewMode === "day" ? focusDay : weekStart}
            colorBy={colorBy}
            dayCount={viewMode === "day" ? 1 : 7}
            columns={techColumns}
            showUnassigned={showUnassigned}
          />
        )}
      </div>
    </div>
  );
}
