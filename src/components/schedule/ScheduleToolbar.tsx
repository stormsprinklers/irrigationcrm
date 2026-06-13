"use client";

import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Menu,
  Settings,
} from "lucide-react";
import {
  scheduleWeekLabel,
  weeklyRevenue,
  weeklyScheduledHours,
} from "@/lib/mock/schedule-jobs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ScheduleToolbar() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-white px-4 py-3">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon">
          <Menu className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" className="relative">
          <Calendar className="h-5 w-5" />
          <Badge variant="unread" className="absolute -right-1 -top-1 h-4 min-w-4 px-1 text-[9px]">
            2
          </Badge>
        </Button>
        <Button variant="outline" size="sm">
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
            <DropdownMenuItem>Reschedule selected</DropdownMenuItem>
            <DropdownMenuItem>Assign technician</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold">{scheduleWeekLabel}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8">
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
        <div className="flex rounded-md border border-border">
          <Button variant="default" size="sm" className="rounded-r-none">
            Calendar
          </Button>
          <Button variant="ghost" size="sm" className="rounded-l-none text-muted-foreground">
            Map
          </Button>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              Color by: Area
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Area</DropdownMenuItem>
            <DropdownMenuItem>Technician</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              Week
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Day</DropdownMenuItem>
            <DropdownMenuItem>Week</DropdownMenuItem>
            <DropdownMenuItem>Month</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="icon">
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
