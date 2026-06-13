import {
  scheduleDays,
  scheduleHours,
  scheduleJobs,
} from "@/lib/mock/schedule-jobs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

function formatHour(hour: number) {
  if (hour === 12) return "12pm";
  if (hour > 12) return `${hour - 12}pm`;
  return `${hour}am`;
}

export function WeekGrid() {
  const hourHeight = 56;
  const startHour = scheduleHours[0];
  const endHour = scheduleHours[scheduleHours.length - 1] + 1;
  const totalHours = endHour - startHour;

  return (
    <div className="overflow-x-auto bg-white">
      <div className="min-w-[900px]">
        <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border">
          <div className="border-r border-border bg-muted/30" />
          {scheduleDays.map((day) => (
            <div key={day.date} className="border-r border-border p-2 last:border-r-0">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">{day.label}</p>
                <p className="text-lg font-semibold">{day.date}</p>
              </div>
              <div className="mt-2 rounded-md bg-muted/40 p-2 text-[10px]">
                <p className="font-medium text-muted-foreground">Daily Summary</p>
                <p className="mt-1 font-medium">{day.area}</p>
                <div className="mt-1 flex items-center gap-1">
                  <Avatar className="h-5 w-5">
                    <AvatarFallback className="text-[8px]">JD</AvatarFallback>
                  </Avatar>
                  <Avatar className="h-5 w-5">
                    <AvatarFallback className="text-[8px]">MK</AvatarFallback>
                  </Avatar>
                </div>
                <p className="mt-1 text-muted-foreground">{day.shift}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="relative grid grid-cols-[60px_repeat(7,1fr)]">
          <div className="border-r border-border">
            {scheduleHours.map((hour) => (
              <div
                key={hour}
                className="border-b border-border pr-2 text-right text-xs text-muted-foreground"
                style={{ height: hourHeight }}
              >
                <span className="relative -top-2">{formatHour(hour)}</span>
              </div>
            ))}
          </div>

          {scheduleDays.map((day, dayIndex) => (
            <div
              key={day.date}
              className="relative border-r border-border last:border-r-0"
              style={{ height: totalHours * hourHeight }}
            >
              {scheduleHours.map((hour) => (
                <div
                  key={hour}
                  className="border-b border-border/60"
                  style={{ height: hourHeight }}
                />
              ))}

              {scheduleJobs
                .filter((job) => job.dayIndex === dayIndex)
                .map((job) => {
                  const top = (job.startHour - startHour) * hourHeight;
                  const height = job.durationHours * hourHeight - 4;
                  const left = 4 + job.lane * 48;

                  return (
                    <div
                      key={job.id}
                      className={cn(
                        "absolute z-10 overflow-hidden rounded border p-1.5 text-[10px] shadow-sm",
                        job.color
                      )}
                      style={{
                        top: top + 2,
                        height,
                        left,
                        right: job.lane > 0 ? undefined : 4,
                        width: job.lane > 0 ? 44 : undefined,
                      }}
                    >
                      <div className="flex items-center gap-1">
                        <Wrench className="h-3 w-3 shrink-0" />
                        <Avatar className="h-4 w-4">
                          <AvatarFallback className="text-[7px]">
                            {job.techInitials}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                      <p className="mt-0.5 truncate font-medium">{job.location}</p>
                      <p className="text-muted-foreground">{job.timeWindow}</p>
                    </div>
                  );
                })}
            </div>
          ))}

          <div
            className="pointer-events-none absolute left-[60px] right-0 z-20 border-t-2 border-red-500"
            style={{ top: 3 * hourHeight + 28 }}
          >
            <div className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full bg-red-500" />
          </div>
        </div>
      </div>
    </div>
  );
}
