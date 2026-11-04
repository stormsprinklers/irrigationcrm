"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Menu,
  Settings,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { InboxCountOrb } from "@/components/layout/InboxCountOrb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ScheduleViewMode } from "@/components/schedule/WeekGrid";
import type { ColorByMode } from "@/lib/schedule/types";
import { HolidayScheduleExportDialog } from "@/components/schedule/HolidayScheduleExportDialog";

type Props = {
  weekLabel: string;
  weeklyRevenue: string;
  weeklyScheduledHours: string;
  colorBy: ColorByMode;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  pendingTimeOffCount?: number;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onColorByChange: (mode: ColorByMode) => void;
  viewMode?: ScheduleViewMode;
  onViewModeChange?: (mode: ScheduleViewMode) => void;
  canExport?: boolean;
  exportStart?: Date;
  exportEnd?: Date;
};

const COLOR_BY_LABELS: Record<ColorByMode, string> = {
  area: "Area",
  technician: "Employee",
  crew: "Crew",
  division: "Division",
};

const VIEW_LABELS: Record<ScheduleViewMode, string> = {
  week: "Week",
  day: "Day",
  month: "Month",
};

export function ScheduleToolbar({
  weekLabel,
  weeklyRevenue,
  weeklyScheduledHours,
  colorBy,
  sidebarOpen,
  onToggleSidebar,
  pendingTimeOffCount = 0,
  onPrevWeek,
  onNextWeek,
  onToday,
  onColorByChange,
  viewMode = "week",
  onViewModeChange,
  canExport = false,
  exportStart = new Date(),
  exportEnd = new Date(),
}: Props) {
  const metricsHidden = viewMode === "month";
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-white px-4 py-2.5">
      <div className="flex items-center gap-2">
        {canExport ? (
          <Button
            variant="ghost"
            size="icon"
            title="Export holiday lighting schedule"
            aria-label="Export holiday lighting schedule"
            onClick={() => setExportOpen(true)}
          >
            <Download className="h-4 w-4" />
          </Button>
        ) : null}
        <Button
          variant={sidebarOpen ? "secondary" : "outline"}
          size="icon"
          className="relative h-8 w-8"
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? "Close schedule filters" : "Open schedule filters"}
        >
          <Menu className="h-4 w-4" />
          <InboxCountOrb count={pendingTimeOffCount} className="absolute -right-1.5 -top-1.5" />
        </Button>
        <Button variant="outline" size="sm" onClick={onToday}>
          Today
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onPrevWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[140px] text-center text-sm font-semibold">{weekLabel}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onNextWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        {!metricsHidden ? (
          <div className="hidden items-center gap-4 text-sm text-muted-foreground lg:flex">
            <span>
              {viewMode === "day" ? "Daily" : "Weekly"} revenue:{" "}
              <strong className="text-foreground">{weeklyRevenue}</strong>
            </span>
            <span>
              {viewMode === "day" ? "Daily" : "Weekly"} scheduled hours:{" "}
              <strong className="text-foreground">{weeklyScheduledHours}</strong>
            </span>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {viewMode !== "month" ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Color by: {COLOR_BY_LABELS[colorBy]}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(Object.keys(COLOR_BY_LABELS) as ColorByMode[]).map((mode) => (
                <DropdownMenuItem key={mode} onClick={() => onColorByChange(mode)}>
                  {COLOR_BY_LABELS[mode]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              {VIEW_LABELS[viewMode]}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onViewModeChange?.("day")}>Day</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onViewModeChange?.("week")}>Week</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onViewModeChange?.("month")}>Month</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="icon" asChild>
          <a href="/settings/employees">
            <Settings className="h-4 w-4" />
          </a>
        </Button>
      </div>
      <HolidayScheduleExportDialog
        open={exportOpen}
        defaultStart={exportStart}
        defaultEnd={exportEnd}
        onClose={() => setExportOpen(false)}
      />
    </div>
  );
}
