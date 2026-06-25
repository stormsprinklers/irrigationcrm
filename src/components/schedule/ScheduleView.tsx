"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";
import { toast } from "sonner";
import { ScheduleFilterSidebar } from "./ScheduleFilterSidebar";
import { ScheduleToolbar } from "./ScheduleToolbar";
import { TeamSchedulePanel } from "./TeamSchedulePanel";
import { WeekGrid, type ScheduleViewMode, type TechColumn } from "./WeekGrid";
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
  const [viewMode, setViewMode] = useState<ScheduleViewMode>("week");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [monthStart, setMonthStart] = useState(() => startOfMonth(new Date()));
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

  const rangeEnd = useMemo(() => {
    if (viewMode === "day") {
      const end = new Date(focusDay);
      end.setHours(23, 59, 59, 999);
      return end;
    }
    if (viewMode === "month") {
      const end = endOfMonth(monthStart);
      end.setHours(23, 59, 59, 999);
      return end;
    }
    return endOfWeek(weekStart, { weekStartsOn: 0 });
  }, [weekStart, focusDay, monthStart, viewMode]);

  const rangeStart = useMemo(() => {
    if (viewMode === "day") return focusDay;
    if (viewMode === "month") return startOfMonth(monthStart);
    return weekStart;
  }, [viewMode, focusDay, monthStart, weekStart]);

  const periodLabel = useMemo(() => {
    if (viewMode === "day") return format(focusDay, "EEEE, MMMM d, yyyy");
    if (viewMode === "month") return format(monthStart, "MMMM yyyy");
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    return `${format(weekStart, "MMMM d")}–${format(end, "d, yyyy")}`;
  }, [weekStart, focusDay, monthStart, viewMode]);

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
      const end = new Date(rangeEnd.getTime() + 1).toISOString();

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
  }, [rangeStart, rangeEnd, buildFilterQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function goToToday() {
    const today = startOfDay(new Date());
    setFocusDay(today);
    setWeekStart(startOfWeek(today, { weekStartsOn: 0 }));
    setMonthStart(startOfMonth(today));
  }

  function goPrev() {
    if (viewMode === "day") setFocusDay((d) => subDays(d, 1));
    else if (viewMode === "month") setMonthStart((d) => subMonths(d, 1));
    else setWeekStart((d) => subWeeks(d, 1));
  }

  function goNext() {
    if (viewMode === "day") setFocusDay((d) => addDays(d, 1));
    else if (viewMode === "month") setMonthStart((d) => addMonths(d, 1));
    else setWeekStart((d) => addWeeks(d, 1));
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <ScheduleToolbar
        weekLabel={periodLabel}
        weeklyRevenue={summary.revenueFormatted}
        weeklyScheduledHours={summary.scheduledHoursFormatted}
        colorBy={colorBy}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
        onPrevWeek={goPrev}
        onNextWeek={goNext}
        onToday={goToToday}
        viewMode={viewMode}
        onViewModeChange={(mode) => {
          setViewMode(mode);
          if (mode === "day") setFocusDay(startOfDay(new Date()));
          if (mode === "month") setMonthStart(startOfMonth(new Date()));
          if (mode === "week") setWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }));
        }}
        onColorByChange={setColorBy}
      />

      <div className="relative flex min-h-0 w-full flex-1 overflow-hidden">
        {sidebarOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            aria-label="Close schedule filters"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}

        <ScheduleFilterSidebar
          open={sidebarOpen && panelMode === "jobs"}
          onClose={() => setSidebarOpen(false)}
          weekStart={
            viewMode === "month"
              ? startOfWeek(monthStart, { weekStartsOn: 0 })
              : viewMode === "day"
                ? startOfWeek(focusDay, { weekStartsOn: 0 })
                : weekStart
          }
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
            weekStart={
              viewMode === "month"
                ? startOfWeek(monthStart, { weekStartsOn: 0 })
                : viewMode === "day"
                  ? startOfWeek(focusDay, { weekStartsOn: 0 })
                  : weekStart
            }
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
            monthStart={monthStart}
            colorBy={colorBy}
            dayCount={viewMode === "day" ? 1 : 7}
            viewMode={viewMode}
            columns={techColumns}
            showUnassigned={showUnassigned}
            onDayClick={(day) => {
              setFocusDay(startOfDay(day));
              setViewMode("day");
            }}
          />
        )}
      </div>
    </div>
  );
}
