"use client";

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  Settings,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScheduleFiltersPanel } from "./ScheduleFilters";
import type { ColorByMode, ScheduleFilters } from "@/lib/schedule/types";

type FilterOptions = {
  serviceAreas: { id: string; name: string; color: string }[];
  employees: { id: string; name: string }[];
  crews: { id: string; name: string; color: string }[];
};

type Props = {
  weekLabel: string;
  weeklyRevenue: string;
  weeklyScheduledHours: string;
  colorBy: ColorByMode;
  filters: ScheduleFilters;
  filterOptions: FilterOptions;
  filtersOpen: boolean;
  activeFilterCount: number;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onColorByChange: (mode: ColorByMode) => void;
  onFiltersChange: (filters: ScheduleFilters) => void;
  onToggleFilters: () => void;
  onBulkAction: (action: string) => void;
  viewMode?: "week" | "day";
  onViewModeChange?: (mode: "week" | "day") => void;
};

const COLOR_BY_LABELS: Record<ColorByMode, string> = {
  area: "Area",
  technician: "Technician",
  crew: "Crew",
  division: "Division",
};

export function ScheduleToolbar({
  weekLabel,
  weeklyRevenue,
  weeklyScheduledHours,
  colorBy,
  filters,
  filterOptions,
  filtersOpen,
  activeFilterCount,
  onPrevWeek,
  onNextWeek,
  onToday,
  onColorByChange,
  onFiltersChange,
  onToggleFilters,
  onBulkAction,
  viewMode = "week",
  onViewModeChange,
}: Props) {
  return (
    <div className="relative flex flex-wrap items-center justify-between gap-4 border-b border-border bg-white px-4 py-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onToday}>
          Today
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              Bulk actions
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => onBulkAction("reschedule")}>
              Reschedule selected
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onBulkAction("assign")}>
              Assign technician
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onPrevWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold">{weekLabel}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onNextWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="hidden items-center gap-4 text-sm text-muted-foreground md:flex">
          <span>
            Weekly revenue: <strong className="text-foreground">{weeklyRevenue}</strong>
          </span>
          <span>
            Weekly scheduled hours:{" "}
            <strong className="text-foreground">{weeklyScheduledHours}</strong>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative">
          <Button variant="outline" size="sm" onClick={onToggleFilters}>
            <Filter className="mr-1 h-4 w-4" />
            Filters
            {activeFilterCount > 0 ? (
              <Badge variant="unread" className="ml-1 h-4 min-w-4 px-1 text-[9px]">
                {activeFilterCount}
              </Badge>
            ) : null}
          </Button>
          <ScheduleFiltersPanel
            open={filtersOpen}
            onClose={onToggleFilters}
            filters={filters}
            options={filterOptions}
            onChange={onFiltersChange}
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              Color by: {COLOR_BY_LABELS[colorBy]}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {(Object.keys(COLOR_BY_LABELS) as ColorByMode[]).map((mode) => (
              <DropdownMenuItem key={mode} onClick={() => onColorByChange(mode)}>
                {COLOR_BY_LABELS[mode]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              {viewMode === "day" ? "Day" : "Week"}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => onViewModeChange?.("day")}>Day</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onViewModeChange?.("week")}>Week</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="icon" asChild>
          <a href="/settings/employees">
            <Settings className="h-4 w-4" />
          </a>
        </Button>
      </div>
    </div>
  );
}
