"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfDay,
  startOfWeek,
} from "date-fns";
import { Truck, Wrench } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { jobCardStyle } from "@/lib/schedule/colors";
import type { ColorByMode, ScheduleJobDTO } from "@/lib/schedule/types";
import { cn } from "@/lib/utils";
import { blobProxyUrl } from "@/lib/blob/urls";
import { buildScheduleSlotClick } from "@/lib/schedule/quick-add";
import type { ScheduleSlotClick } from "@/lib/schedule/quick-add";

const SCHEDULE_START_HOUR = 4;
const SCHEDULE_END_HOUR = 22;
const SCHEDULE_HOURS = Array.from(
  { length: SCHEDULE_END_HOUR - SCHEDULE_START_HOUR + 1 },
  (_, i) => SCHEDULE_START_HOUR + i
);
const DEFAULT_VIEW_START_HOUR = 7;
const DEFAULT_VIEW_END_HOUR = 16;
const HOUR_HEIGHT = 56;
const TIME_GUTTER = 60;
const DAY_MIN_WIDTH = 132;
const TECH_COL_WIDTH = 52;
const MULTI_DAY_ROW_HEIGHT = 44;

export type TechColumn = {
  id: string;
  name: string;
  color?: string | null;
  photoUrl?: string | null;
  isUnassigned?: boolean;
};

export type ScheduleViewMode = "week" | "day" | "month";

function formatHour(hour: number) {
  if (hour === 12) return "12pm";
  if (hour > 12) return `${hour - 12}pm`;
  return `${hour}am`;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function isMultiDayBarJob(job: ScheduleJobDTO) {
  if (job.crew) return true;
  const startDay = startOfDay(new Date(job.startAt));
  const endDay = startOfDay(new Date(job.endAt));
  return endDay.getTime() > startDay.getTime();
}

function getJobColumnId(job: ScheduleJobDTO) {
  return job.assignedUser?.id ?? "__unassigned__";
}

function assignLanes(jobs: ScheduleJobDTO[]) {
  const sorted = [...jobs].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
  );
  const laneEnds: number[] = [];

  return sorted.map((job) => {
    const start = new Date(job.startAt).getTime();
    const end = new Date(job.endAt).getTime();
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    return { job, lane, laneCount: laneEnds.length };
  });
}

function jobLocation(job: ScheduleJobDTO) {
  return [job.city, job.state].filter(Boolean).join(", ") || job.serviceArea.name;
}

function JobBlock({
  job,
  lane,
  laneCount,
  colorBy,
  columnWidth,
  startHour,
}: {
  job: ScheduleJobDTO;
  lane: number;
  laneCount: number;
  colorBy: ColorByMode;
  columnWidth: number;
  startHour: number;
}) {
  const start = new Date(job.startAt);
  const end = new Date(job.endAt);
  const startFraction = start.getHours() + start.getMinutes() / 60;
  const endFraction = end.getHours() + end.getMinutes() / 60;
  const top = (startFraction - startHour) * HOUR_HEIGHT;
  const height = Math.max((endFraction - startFraction) * HOUR_HEIGHT - 2, 22);
  const style = jobCardStyle(job, colorBy);
  const laneWidth = Math.max(28, Math.floor((columnWidth - 8) / laneCount) - 2);
  const left = 4 + lane * (laneWidth + 2);

  return (
    <Link
      href={`/visits/${job.id}`}
      className="absolute z-10 block overflow-hidden rounded border shadow-sm transition-shadow hover:z-20 hover:shadow-md"
      style={{
        top: top + 1,
        height,
        left,
        width: laneCount > 1 ? laneWidth : columnWidth - 8,
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
      }}
      title={`${job.title} · ${format(start, "h:mm a")} – ${format(end, "h:mm a")}`}
    >
      <div className="flex h-full flex-col p-1 text-[9px]">
        <div className="flex items-center gap-0.5">
          <Wrench className="h-2.5 w-2.5 shrink-0 opacity-80" />
          {job.assignedUser ? (
            <Avatar className="h-3.5 w-3.5 shrink-0">
              {job.assignedUser.photoUrl ? (
                <AvatarImage src={blobProxyUrl(job.assignedUser.photoUrl)} alt={job.assignedUser.name} />
              ) : null}
              <AvatarFallback
                className="text-[6px]"
                style={{ backgroundColor: job.assignedUser.color ?? "#64748B", color: "#fff" }}
              >
                {getInitials(job.assignedUser.name)}
              </AvatarFallback>
            </Avatar>
          ) : null}
        </div>
        {height >= 40 ? (
          <p className="mt-0.5 truncate font-medium leading-tight">
            {format(start, "h:mm")}
          </p>
        ) : null}
        {height >= 56 ? (
          <p className="mt-0.5 truncate text-[8px] text-muted-foreground">{jobLocation(job)}</p>
        ) : null}
      </div>
    </Link>
  );
}

type TimeGridProps = {
  jobs: ScheduleJobDTO[];
  weekStart: Date;
  colorBy: ColorByMode;
  dayCount: number;
  viewMode: "week" | "day";
  columns: TechColumn[];
  showUnassigned: boolean;
  onSlotClick?: (slot: ScheduleSlotClick) => void;
};

function handleGridClick(
  event: React.MouseEvent<HTMLElement>,
  day: Date,
  assignedUserId: string | null,
  assignedUserName: string | null,
  onSlotClick?: (slot: ScheduleSlotClick) => void
) {
  if (!onSlotClick) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const offsetY = event.clientY - rect.top;
  onSlotClick(
    buildScheduleSlotClick(
      day,
      offsetY,
      HOUR_HEIGHT,
      SCHEDULE_START_HOUR,
      SCHEDULE_END_HOUR,
      assignedUserId === "__unassigned__" ? null : assignedUserId,
      assignedUserName
    )
  );
}

function TimeGrid({ jobs, weekStart, colorBy, dayCount, viewMode, columns, showUnassigned, onSlotClick }: TimeGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [weekDayWidth, setWeekDayWidth] = useState(DAY_MIN_WIDTH);

  const startHour = SCHEDULE_HOURS[0];
  const endHour = SCHEDULE_END_HOUR + 1;
  const totalHours = endHour - startHour;
  const gridHeight = totalHours * HOUR_HEIGHT;
  const isDayView = viewMode === "day";
  const dayWidth = isDayView ? columns.length * TECH_COL_WIDTH : weekDayWidth;
  const gridMinWidth = TIME_GUTTER + dayCount * (isDayView ? dayWidth : DAY_MIN_WIDTH);

  useEffect(() => {
    if (isDayView) return;
    const el = scrollRef.current;
    if (!el) return;

    const updateWidth = () => {
      const available = el.clientWidth - TIME_GUTTER;
      setWeekDayWidth(Math.max(DAY_MIN_WIDTH, Math.floor(available / dayCount)));
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, [dayCount, isDayView]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const viewStartPx = (DEFAULT_VIEW_START_HOUR - startHour) * HOUR_HEIGHT;
    const viewEndPx = (DEFAULT_VIEW_END_HOUR - startHour + 1) * HOUR_HEIGHT;
    const businessCenter = (viewStartPx + viewEndPx) / 2;
    const targetScroll = Math.max(0, businessCenter - el.clientHeight / 2);

    el.scrollTop = targetScroll;
  }, [weekStart, dayCount, viewMode, startHour]);

  const visibleColumnIds = useMemo(() => {
    const ids = new Set(columns.map((c) => c.id));
    if (!showUnassigned) ids.delete("__unassigned__");
    return ids;
  }, [columns, showUnassigned]);

  const days = useMemo(() => {
    return Array.from({ length: dayCount }, (_, i) => {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);
      return date;
    });
  }, [weekStart, dayCount]);

  const { hourlyJobs, multiDayJobs } = useMemo(() => {
    const hourly: ScheduleJobDTO[] = [];
    const multiDay: ScheduleJobDTO[] = [];
    for (const job of jobs) {
      if (isMultiDayBarJob(job)) multiDay.push(job);
      else hourly.push(job);
    }
    return { hourlyJobs: hourly, multiDayJobs: multiDay };
  }, [jobs]);

  const now = new Date();
  const rangeEndMs = weekStart.getTime() + dayCount * 24 * 60 * 60 * 1000;
  const isCurrentRange = now >= weekStart && now < new Date(rangeEndMs);
  const currentLineTop = isCurrentRange
    ? ((now.getHours() + now.getMinutes() / 60 - startHour) / totalHours) * gridHeight
    : null;

  const multiDayLanes = useMemo(() => assignLanes(multiDayJobs), [multiDayJobs]);
  const multiDayRowHeight =
    multiDayJobs.length > 0
      ? Math.max(MULTI_DAY_ROW_HEIGHT, multiDayLanes.length * MULTI_DAY_ROW_HEIGHT)
      : 0;
  const dayHeaderHeight = 56;
  const dayViewTechRowHeight = isDayView ? 32 : 0;
  const stickyHeaderHeight = dayHeaderHeight + multiDayRowHeight + dayViewTechRowHeight;

  if (isDayView && columns.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        Select at least one employee to display on the schedule.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <div className="relative w-full" style={{ minWidth: gridMinWidth }}>
          <div className="sticky top-0 z-30 border-b border-border bg-white shadow-sm">
            <div className="flex w-full border-b border-border">
              <div
                className="sticky left-0 z-40 shrink-0 border-r border-border bg-muted/30"
                style={{ width: TIME_GUTTER }}
              />
              {days.map((day) => {
                const isToday = startOfDay(day).getTime() === startOfDay(new Date()).getTime();
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "border-r border-border px-2 py-2 text-center last:border-r-0",
                      !isDayView && "min-w-0 flex-1"
                    )}
                    style={isDayView ? { width: dayWidth, flexShrink: 0 } : { minWidth: DAY_MIN_WIDTH }}
                  >
                    <p className="text-xs text-muted-foreground">{format(day, "EEE")}</p>
                    <p
                      className={cn(
                        "mx-auto mt-0.5 inline-flex h-7 w-7 items-center justify-center text-sm font-semibold",
                        isToday && "rounded-full bg-primary text-primary-foreground"
                      )}
                    >
                      {format(day, "d")}
                    </p>
                  </div>
                );
              })}
            </div>

            {multiDayRowHeight > 0 ? (
              <div className="flex w-full border-b border-border bg-muted/20">
                <div
                  className="sticky left-0 z-40 shrink-0 border-r border-border bg-muted/20"
                  style={{ width: TIME_GUTTER }}
                />
                <div
                  className="relative min-w-0 flex-1"
                  style={{ height: multiDayRowHeight }}
                >
                  {multiDayLanes.map(({ job, lane }) => {
                    const jobStart = startOfDay(new Date(job.startAt));
                    const jobEnd = startOfDay(new Date(job.endAt));
                    const weekEndDay = startOfDay(days[days.length - 1]);

                    let startIdx = days.findIndex(
                      (d) => startOfDay(d).getTime() === jobStart.getTime()
                    );
                    if (startIdx === -1 && jobStart < startOfDay(days[0])) startIdx = 0;
                    if (startIdx === -1 && jobStart > weekEndDay) return null;

                    let endIdx = days.findIndex((d) => startOfDay(d).getTime() === jobEnd.getTime());
                    if (endIdx === -1 && jobEnd > weekEndDay) endIdx = days.length - 1;
                    if (endIdx === -1 && jobEnd < startOfDay(days[0])) return null;
                    if (startIdx === -1) startIdx = 0;
                    if (endIdx === -1) endIdx = days.length - 1;

                    const left = startIdx * dayWidth + 2;
                    const width = (endIdx - startIdx + 1) * dayWidth - 4;
                    const cardStyle = jobCardStyle(job, colorBy);
                    const start = new Date(job.startAt);
                    const end = new Date(job.endAt);

                    return (
                      <Link
                        key={job.id}
                        href={`/visits/${job.id}`}
                        className="absolute z-10 flex items-center gap-2 overflow-hidden rounded border px-2 py-1 text-[10px] shadow-sm transition-shadow hover:shadow-md"
                        style={{
                          top: lane * MULTI_DAY_ROW_HEIGHT + 4,
                          left,
                          width,
                          height: MULTI_DAY_ROW_HEIGHT - 8,
                          backgroundColor: cardStyle.backgroundColor,
                          borderColor: cardStyle.borderColor,
                        }}
                      >
                        {job.crew ? (
                          <Truck className="h-3 w-3 shrink-0" />
                        ) : (
                          <Wrench className="h-3 w-3 shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{jobLocation(job)}</p>
                          <p className="truncate text-muted-foreground">
                            {format(start, "h:mm a")} – {format(end, "h:mm a")}
                            {job.crew ? ` · ${job.crew.name}` : ""}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {isDayView && days[0] ? (
              <div className="flex border-b border-border bg-muted/10">
                <div
                  className="sticky left-0 z-40 shrink-0 border-r border-border bg-muted/10"
                  style={{ width: TIME_GUTTER }}
                />
                <div className="flex shrink-0" style={{ width: dayWidth }}>
                  {columns.map((col) => (
                    <div
                      key={col.id}
                      className="border-r border-border/60 px-0.5 py-1 text-center last:border-r-0"
                      style={{ width: TECH_COL_WIDTH }}
                      title={col.name}
                    >
                      {col.isUnassigned ? (
                        <span className="text-[9px] text-muted-foreground">—</span>
                      ) : (
                        <Avatar className="mx-auto h-5 w-5">
                          {col.photoUrl ? (
                            <AvatarImage src={blobProxyUrl(col.photoUrl)} alt={col.name} />
                          ) : null}
                          <AvatarFallback
                            className="text-[7px]"
                            style={{ backgroundColor: col.color ?? "#64748B", color: "#fff" }}
                          >
                            {getInitials(col.name)}
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="relative flex w-full">
            <div
              className="sticky left-0 z-20 shrink-0 border-r border-border bg-white"
              style={{ width: TIME_GUTTER }}
            >
              <div className="border-b border-border px-1 py-1 text-[10px] text-muted-foreground">
                GMT-6
              </div>
              {SCHEDULE_HOURS.map((hour) => (
                <div
                  key={hour}
                  className="border-b border-border pr-2 text-right text-xs text-muted-foreground"
                  style={{ height: HOUR_HEIGHT }}
                >
                  <span className="relative -top-2">{formatHour(hour)}</span>
                </div>
              ))}
            </div>

            {days.map((day) => {
              const dayKey = startOfDay(day).toDateString();

              if (isDayView) {
                return (
                  <div
                    key={`grid-${day.toISOString()}`}
                    className="flex shrink-0 border-r border-border last:border-r-0"
                    style={{ width: dayWidth, height: gridHeight }}
                  >
                    {columns.map((col) => {
                      const colJobs = hourlyJobs.filter((job) => {
                        if (getJobColumnId(job) !== col.id) return false;
                        if (!visibleColumnIds.has(col.id)) return false;
                        return startOfDay(new Date(job.startAt)).toDateString() === dayKey;
                      });
                      const laidOut = assignLanes(colJobs);

                      return (
                        <div
                          key={`${dayKey}-${col.id}`}
                          className="relative border-r border-border/60 last:border-r-0"
                          style={{ width: TECH_COL_WIDTH, height: gridHeight }}
                        >
                          <button
                            type="button"
                            className="absolute inset-0 z-[1] cursor-cell border-0 bg-transparent p-0 hover:bg-primary/5"
                            aria-label={`Add visit for ${col.name} at ${format(day, "MMM d")}`}
                            onClick={(e) =>
                              handleGridClick(e, day, col.id, col.name, onSlotClick)
                            }
                          />
                          {SCHEDULE_HOURS.map((hour) => (
                            <div
                              key={hour}
                              className="pointer-events-none border-b border-border/60"
                              style={{ height: HOUR_HEIGHT }}
                            />
                          ))}
                          {laidOut.map(({ job, lane, laneCount }) => (
                            <JobBlock
                              key={job.id}
                              job={job}
                              lane={lane}
                              laneCount={laneCount}
                              colorBy={colorBy}
                              columnWidth={TECH_COL_WIDTH}
                              startHour={startHour}
                            />
                          ))}
                        </div>
                      );
                    })}
                  </div>
                );
              }

              const dayJobs = hourlyJobs.filter(
                (job) => startOfDay(new Date(job.startAt)).toDateString() === dayKey
              );
              const laidOut = assignLanes(dayJobs);

              return (
                <div
                  key={`grid-${day.toISOString()}`}
                  className={cn(
                    "relative border-r border-border last:border-r-0",
                    !isDayView && "min-w-0 flex-1"
                  )}
                  style={
                    isDayView
                      ? { width: dayWidth, flexShrink: 0, height: gridHeight }
                      : { minWidth: DAY_MIN_WIDTH, height: gridHeight }
                  }
                >
                  <button
                    type="button"
                    className="absolute inset-0 z-[1] cursor-cell border-0 bg-transparent p-0 hover:bg-primary/5"
                    aria-label={`Add visit on ${format(day, "MMM d")}`}
                    onClick={(e) => handleGridClick(e, day, null, null, onSlotClick)}
                  />
                  {SCHEDULE_HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="pointer-events-none border-b border-border/60"
                      style={{ height: HOUR_HEIGHT }}
                    />
                  ))}
                  {laidOut.map(({ job, lane, laneCount }) => (
                    <JobBlock
                      key={job.id}
                      job={job}
                      lane={lane}
                      laneCount={laneCount}
                      colorBy={colorBy}
                      columnWidth={dayWidth}
                      startHour={startHour}
                    />
                  ))}
                </div>
              );
            })}
          </div>

          {currentLineTop !== null && currentLineTop >= 0 && currentLineTop <= gridHeight ? (
            <div
              className="pointer-events-none absolute z-20 border-t-2 border-red-500"
              style={{
                top: stickyHeaderHeight + 24 + currentLineTop,
                left: TIME_GUTTER,
                right: 0,
              }}
            >
              <div className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full bg-red-500" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type MonthGridProps = {
  jobs: ScheduleJobDTO[];
  monthStart: Date;
  onDayClick?: (day: Date) => void;
};

function MonthScheduleGrid({ jobs, monthStart, onDayClick }: MonthGridProps) {
  const monthEnd = endOfMonth(monthStart);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const dayStats = useMemo(() => {
    const stats = new Map<string, { jobCount: number; revenue: number }>();
    for (const job of jobs) {
      const key = startOfDay(new Date(job.startAt)).toDateString();
      const current = stats.get(key) ?? { jobCount: 0, revenue: 0 };
      stats.set(key, {
        jobCount: current.jobCount + 1,
        revenue: current.revenue + (job.total ?? 0),
      });
    }
    return stats;
  }, [jobs]);

  const monthRevenue = useMemo(() => {
    let total = 0;
    for (const job of jobs) {
      const d = startOfDay(new Date(job.startAt));
      if (isSameMonth(d, monthStart)) total += job.total ?? 0;
    }
    return total;
  }, [jobs, monthStart]);

  const monthJobCount = useMemo(() => {
    return jobs.filter((job) => isSameMonth(new Date(job.startAt), monthStart)).length;
  }, [jobs, monthStart]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
      <div className="shrink-0 border-b border-border px-4 py-3 text-sm text-muted-foreground">
        <span>
          {monthJobCount} job{monthJobCount === 1 ? "" : "s"} ·{" "}
          <strong className="text-foreground">
            {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
              monthRevenue
            )}
          </strong>{" "}
          scheduled revenue
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="grid h-full min-h-full grid-cols-7 gap-px border-t border-border bg-border">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
            <div
              key={label}
              className="bg-muted/40 px-2 py-2 text-center text-xs font-semibold text-muted-foreground"
            >
              {label}
            </div>
          ))}
          {days.map((day) => {
            const inMonth = isSameMonth(day, monthStart);
            const isToday = startOfDay(day).getTime() === startOfDay(new Date()).getTime();
            const stats = dayStats.get(startOfDay(day).toDateString());
            const jobCount = stats?.jobCount ?? 0;
            const revenue = stats?.revenue ?? 0;

            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => onDayClick?.(day)}
                className={cn(
                  "min-h-[100px] bg-white p-2 text-left transition-colors hover:bg-muted/30",
                  !inMonth && "bg-muted/10 text-muted-foreground/50",
                  isToday && "ring-2 ring-inset ring-primary"
                )}
              >
                <p
                  className={cn(
                    "mb-1 text-sm font-semibold",
                    isToday && "inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground"
                  )}
                >
                  {format(day, "d")}
                </p>
                {inMonth && jobCount > 0 ? (
                  <div className="space-y-0.5 text-[11px]">
                    <p className="font-medium text-foreground">
                      {jobCount} job{jobCount === 1 ? "" : "s"}
                    </p>
                    <p className="text-muted-foreground">
                      {new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "USD",
                        maximumFractionDigits: 0,
                      }).format(revenue)}
                    </p>
                  </div>
                ) : inMonth ? (
                  <p className="text-[11px] text-muted-foreground">—</p>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type Props = {
  jobs: ScheduleJobDTO[];
  weekStart: Date;
  monthStart?: Date;
  colorBy: ColorByMode;
  dayCount?: number;
  viewMode?: ScheduleViewMode;
  columns: TechColumn[];
  showUnassigned: boolean;
  onDayClick?: (day: Date) => void;
  onSlotClick?: (slot: ScheduleSlotClick) => void;
};

export function WeekGrid({
  jobs,
  weekStart,
  monthStart,
  colorBy,
  dayCount = 7,
  viewMode = "week",
  columns,
  showUnassigned,
  onDayClick,
  onSlotClick,
}: Props) {
  if (viewMode === "month" && monthStart) {
    return <MonthScheduleGrid jobs={jobs} monthStart={monthStart} onDayClick={onDayClick} />;
  }

  return (
    <TimeGrid
      jobs={jobs}
      weekStart={weekStart}
      colorBy={colorBy}
      dayCount={dayCount}
      viewMode={viewMode === "day" ? "day" : "week"}
      columns={columns}
      showUnassigned={showUnassigned}
      onSlotClick={onSlotClick}
    />
  );
}
