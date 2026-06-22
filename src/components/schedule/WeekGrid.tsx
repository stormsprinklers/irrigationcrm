"use client";

import { useMemo } from "react";
import Link from "next/link";
import { format, startOfDay } from "date-fns";
import { Truck, Wrench } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { jobCardStyle } from "@/lib/schedule/colors";
import type { ColorByMode, ScheduleJobDTO } from "@/lib/schedule/types";
import { cn } from "@/lib/utils";
import { blobProxyUrl } from "@/lib/blob/urls";

const SCHEDULE_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
const HOUR_HEIGHT = 56;
const TECH_COL_WIDTH = 52;
const MULTI_DAY_ROW_HEIGHT = 44;

export type TechColumn = {
  id: string;
  name: string;
  color?: string | null;
  photoUrl?: string | null;
  isUnassigned?: boolean;
};

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

type Props = {
  jobs: ScheduleJobDTO[];
  weekStart: Date;
  colorBy: ColorByMode;
  dayCount?: number;
  columns: TechColumn[];
  showUnassigned: boolean;
};

export function WeekGrid({
  jobs,
  weekStart,
  colorBy,
  dayCount = 7,
  columns,
  showUnassigned,
}: Props) {
  const startHour = SCHEDULE_HOURS[0];
  const endHour = SCHEDULE_HOURS[SCHEDULE_HOURS.length - 1] + 1;
  const totalHours = endHour - startHour;
  const gridHeight = totalHours * HOUR_HEIGHT;
  const dayWidth = columns.length * TECH_COL_WIDTH;

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
  const weekEndMs = weekStart.getTime() + dayCount * 24 * 60 * 60 * 1000;
  const isCurrentWeek = now >= weekStart && now < new Date(weekEndMs);
  const currentLineTop = isCurrentWeek
    ? ((now.getHours() + now.getMinutes() / 60 - startHour) / totalHours) * gridHeight
    : null;

  const multiDayLanes = useMemo(() => assignLanes(multiDayJobs), [multiDayJobs]);
  const multiDayRowHeight =
    multiDayJobs.length > 0
      ? Math.max(MULTI_DAY_ROW_HEIGHT, multiDayLanes.length * MULTI_DAY_ROW_HEIGHT)
      : 0;

  if (columns.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        Select at least one employee to display on the schedule.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
      <div className="shrink-0 overflow-x-auto border-b border-border">
        <div style={{ minWidth: 60 + dayCount * dayWidth }}>
          <div className="flex border-b border-border">
            <div className="w-[60px] shrink-0 border-r border-border bg-muted/30" />
            {days.map((day) => {
              const isToday = startOfDay(day).getTime() === startOfDay(new Date()).getTime();
              return (
                <div
                  key={day.toISOString()}
                  className="shrink-0 border-r border-border px-1 py-2 text-center last:border-r-0"
                  style={{ width: dayWidth }}
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
            <div className="flex border-b border-border bg-muted/20">
              <div className="w-[60px] shrink-0 border-r border-border" />
              <div className="relative shrink-0" style={{ width: dayCount * dayWidth, height: multiDayRowHeight }}>
                {multiDayLanes.map(({ job, lane }) => {
                  const jobStart = startOfDay(new Date(job.startAt));
                  const jobEnd = startOfDay(new Date(job.endAt));
                  const weekEndDay = startOfDay(days[days.length - 1]);

                  let startIdx = days.findIndex((d) => startOfDay(d).getTime() === jobStart.getTime());
                  if (startIdx === -1 && jobStart < startOfDay(days[0])) startIdx = 0;
                  if (startIdx === -1 && jobStart > weekEndDay) return null;

                  let endIdx = days.findIndex((d) => startOfDay(d).getTime() === jobEnd.getTime());
                  if (endIdx === -1 && jobEnd > weekEndDay) endIdx = days.length - 1;
                  if (endIdx === -1 && jobEnd < startOfDay(days[0])) return null;
                  if (startIdx === -1) startIdx = 0;
                  if (endIdx === -1) endIdx = days.length - 1;

                  const spanDays = endIdx - startIdx + 1;
                  const left = startIdx * dayWidth + 2;
                  const width = spanDays * dayWidth - 4;
                  const style = jobCardStyle(job, colorBy);
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
                        backgroundColor: style.backgroundColor,
                        borderColor: style.borderColor,
                      }}
                    >
                      {job.crew ? <Truck className="h-3 w-3 shrink-0" /> : <Wrench className="h-3 w-3 shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{jobLocation(job)}</p>
                        <p className="truncate text-muted-foreground">
                          {format(start, "hh:mm a")} - {format(end, "hh:mm a")}
                          {job.crew ? ` · ${job.crew.name}` : ""}
                        </p>
                      </div>
                      {job.assignedUser ? (
                        <Avatar className="h-5 w-5 shrink-0">
                          {job.assignedUser.photoUrl ? (
                            <AvatarImage
                              src={blobProxyUrl(job.assignedUser.photoUrl)}
                              alt={job.assignedUser.name}
                            />
                          ) : null}
                          <AvatarFallback
                            className="text-[7px]"
                            style={{
                              backgroundColor: job.assignedUser.color ?? "#64748B",
                              color: "#fff",
                            }}
                          >
                            {getInitials(job.assignedUser.name)}
                          </AvatarFallback>
                        </Avatar>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="flex bg-muted/10">
            <div className="w-[60px] shrink-0 border-r border-border px-1 py-1 text-[10px] text-muted-foreground">
              GMT-6
            </div>
            {days.map((day) => (
              <div
                key={`cols-${day.toISOString()}`}
                className="flex shrink-0 border-r border-border last:border-r-0"
                style={{ width: dayWidth }}
              >
                {columns.map((col) => (
                  <div
                    key={`${day.toISOString()}-${col.id}`}
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
            ))}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="relative" style={{ minWidth: 60 + dayCount * dayWidth }}>
          <div className="flex">
            <div className="sticky left-0 z-10 w-[60px] shrink-0 border-r border-border bg-white">
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

            {days.map((day) => (
              <div
                key={`grid-${day.toISOString()}`}
                className="flex shrink-0 border-r border-border last:border-r-0"
                style={{ width: dayWidth, height: gridHeight }}
              >
                {columns.map((col) => {
                  const dayKey = startOfDay(day).toDateString();
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
                      {SCHEDULE_HOURS.map((hour) => (
                        <div
                          key={hour}
                          className="border-b border-border/60"
                          style={{ height: HOUR_HEIGHT }}
                        />
                      ))}

                      {laidOut.map(({ job, lane, laneCount }) => {
                        const start = new Date(job.startAt);
                        const end = new Date(job.endAt);
                        const startFraction = start.getHours() + start.getMinutes() / 60;
                        const endFraction = end.getHours() + end.getMinutes() / 60;
                        const top = (startFraction - startHour) * HOUR_HEIGHT;
                        const height = Math.max((endFraction - startFraction) * HOUR_HEIGHT - 2, 20);
                        const style = jobCardStyle(job, colorBy);
                        const colWidth = TECH_COL_WIDTH - 4;
                        const laneWidth =
                          laneCount > 1 ? Math.max(14, Math.floor(colWidth / laneCount) - 1) : colWidth;
                        const left = 2 + lane * (laneWidth + 1);

                        return (
                          <Link
                            key={job.id}
                            href={`/visits/${job.id}`}
                            className="absolute z-10 block overflow-hidden rounded border px-0.5 py-0.5 text-[9px] shadow-sm transition-shadow hover:z-20 hover:shadow-md"
                            style={{
                              top: top + 1,
                              height,
                              left,
                              width: laneCount > 1 ? laneWidth : colWidth,
                              backgroundColor: style.backgroundColor,
                              borderColor: style.borderColor,
                            }}
                            title={`${job.title} · ${format(start, "h:mm a")} - ${format(end, "h:mm a")}`}
                          >
                            <div className="flex items-center justify-center gap-0.5">
                              <Wrench className="h-2.5 w-2.5 shrink-0" />
                              {height >= 36 ? (
                                <span className="truncate text-[8px] font-medium">
                                  {format(start, "h:mm")}
                                </span>
                              ) : null}
                            </div>
                            {height >= 52 ? (
                              <p className="truncate px-0.5 text-[8px] text-muted-foreground">
                                {jobLocation(job)}
                              </p>
                            ) : null}
                          </Link>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {currentLineTop !== null && currentLineTop >= 0 && currentLineTop <= gridHeight ? (
            <div
              className="pointer-events-none absolute left-[60px] right-0 z-20 border-t-2 border-red-500"
              style={{ top: currentLineTop }}
            >
              <div className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full bg-red-500" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
