"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import { Wrench } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { jobCardStyle } from "@/lib/schedule/colors";
import type { ColorByMode, ScheduleJobDTO } from "@/lib/schedule/types";
import { cn } from "@/lib/utils";

const SCHEDULE_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
const HOUR_HEIGHT = 56;

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

function assignLanes(dayJobs: ScheduleJobDTO[]) {
  const sorted = [...dayJobs].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
  );
  const lanes: { end: number; lane: number }[] = [];

  return sorted.map((job) => {
    const start = new Date(job.startAt).getTime();
    const end = new Date(job.endAt).getTime();
    let lane = 0;
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i].end <= start) {
        lane = lanes[i].lane;
        lanes[i].end = end;
        break;
      }
    }
    if (!lanes.some((l) => l.lane === lane && l.end > start && l.end !== end)) {
      lanes.push({ end, lane });
    }
    const maxLane = lanes.length - 1;
    return { job, lane: Math.min(lane, maxLane), laneCount: lanes.length };
  });
}

type Props = {
  jobs: ScheduleJobDTO[];
  weekStart: Date;
  colorBy: ColorByMode;
};

export function WeekGrid({ jobs, weekStart, colorBy }: Props) {
  const startHour = SCHEDULE_HOURS[0];
  const endHour = SCHEDULE_HOURS[SCHEDULE_HOURS.length - 1] + 1;
  const totalHours = endHour - startHour;

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);
      return date;
    });
  }, [weekStart]);

  const now = new Date();
  const isCurrentWeek =
    now >= weekStart && now < new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const currentLineTop = isCurrentWeek
    ? ((now.getHours() + now.getMinutes() / 60 - startHour) / totalHours) *
      (totalHours * HOUR_HEIGHT)
    : null;

  return (
    <div className="overflow-x-auto bg-white">
      <div className="min-w-[900px]">
        <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border">
          <div className="border-r border-border bg-muted/30" />
          {days.map((day) => {
            const dayJobs = jobs.filter(
              (j) => new Date(j.startAt).toDateString() === day.toDateString()
            );
            const areas = [...new Set(dayJobs.map((j) => j.serviceArea.name))];
            const techs = [
              ...new Map(
                dayJobs
                  .filter((j) => j.assignedUser)
                  .map((j) => [j.assignedUser!.id, j.assignedUser!])
              ).values(),
            ];

            return (
              <div key={day.toISOString()} className="border-r border-border p-2 last:border-r-0">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">{format(day, "EEE")}</p>
                  <p className="text-lg font-semibold">{format(day, "dd")}</p>
                </div>
                <div className="mt-2 rounded-md bg-muted/40 p-2 text-[10px]">
                  <p className="font-medium text-muted-foreground">Daily Summary</p>
                  <p className="mt-1 font-medium">{areas.slice(0, 2).join(", ") || "No jobs"}</p>
                  <div className="mt-1 flex items-center gap-1">
                    {techs.slice(0, 4).map((tech) => (
                      <Avatar key={tech.id} className="h-5 w-5">
                        {tech.photoUrl ? <AvatarImage src={tech.photoUrl} alt={tech.name} /> : null}
                        <AvatarFallback
                          className="text-[8px]"
                          style={{ backgroundColor: tech.color ?? "#64748B", color: "#fff" }}
                        >
                          {getInitials(tech.name)}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                  </div>
                  <p className="mt-1 text-muted-foreground">{dayJobs.length} job(s)</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="relative grid grid-cols-[60px_repeat(7,1fr)]">
          <div className="border-r border-border">
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
            const dayJobs = jobs.filter(
              (j) => new Date(j.startAt).toDateString() === day.toDateString()
            );
            const laidOut = assignLanes(dayJobs);

            return (
              <div
                key={day.toISOString()}
                className="relative border-r border-border last:border-r-0"
                style={{ height: totalHours * HOUR_HEIGHT }}
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
                  const height = Math.max((endFraction - startFraction) * HOUR_HEIGHT - 4, 24);
                  const laneWidth = Math.max(44, Math.floor(100 / Math.max(laneCount, 1)) - 2);
                  const left = 4 + lane * (laneWidth + 2);
                  const style = jobCardStyle(job, colorBy);
                  const location =
                    [job.city, job.state].filter(Boolean).join(", ") ||
                    job.serviceArea.name;

                  return (
                    <div
                      key={job.id}
                      className={cn(
                        "absolute z-10 overflow-hidden rounded border p-1.5 text-[10px] shadow-sm"
                      )}
                      style={{
                        top: top + 2,
                        height,
                        left,
                        width: laneCount > 1 ? laneWidth : undefined,
                        right: laneCount <= 1 ? 4 : undefined,
                        backgroundColor: style.backgroundColor,
                        borderColor: style.borderColor,
                      }}
                    >
                      <div className="flex items-center gap-1">
                        <Wrench className="h-3 w-3 shrink-0" />
                        {job.assignedUser ? (
                          <Avatar className="h-4 w-4">
                            {job.assignedUser.photoUrl ? (
                              <AvatarImage src={job.assignedUser.photoUrl} alt={job.assignedUser.name} />
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
                      </div>
                      <p className="mt-0.5 truncate font-medium">{job.title}</p>
                      <p className="truncate text-muted-foreground">{location}</p>
                      <p className="text-muted-foreground">
                        {format(start, "h:mm")}-{format(end, "h:mma").toLowerCase()}
                      </p>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {currentLineTop !== null && currentLineTop >= 0 && currentLineTop <= totalHours * HOUR_HEIGHT ? (
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
