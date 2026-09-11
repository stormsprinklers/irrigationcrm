"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_WORK_DAY_END,
  DEFAULT_WORK_DAY_START,
} from "@/lib/schedule/open-time-slots";
import type { WorkScheduleDayDTO } from "@/lib/schedule/time-off-types";

export const WORK_DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

type Props = {
  days: WorkScheduleDayDTO[];
  onChange: (days: WorkScheduleDayDTO[]) => void;
  disabled?: boolean;
};

export function EmployeeWorkHoursEditor({ days, onChange, disabled }: Props) {
  function updateDay(dayOfWeek: number, patch: Partial<WorkScheduleDayDTO>) {
    onChange(days.map((day) => (day.dayOfWeek === dayOfWeek ? { ...day, ...patch } : day)));
  }

  return (
    <div className="space-y-2">
      {days.map((day) => (
        <div
          key={day.dayOfWeek}
          className="flex flex-wrap items-center gap-3 rounded-md border border-border/60 px-3 py-2"
        >
          <label className="flex min-w-[120px] items-center gap-2 text-sm">
            <Checkbox
              checked={day.isWorking}
              disabled={disabled}
              onCheckedChange={(checked) =>
                updateDay(day.dayOfWeek, {
                  isWorking: checked === true,
                  startTime:
                    checked === true ? (day.startTime ?? DEFAULT_WORK_DAY_START) : null,
                  endTime: checked === true ? (day.endTime ?? DEFAULT_WORK_DAY_END) : null,
                })
              }
            />
            {WORK_DAY_LABELS[day.dayOfWeek]}
          </label>
          {day.isWorking ? (
            <div className="flex items-center gap-2 text-sm">
              <Input
                type="time"
                value={day.startTime ?? ""}
                disabled={disabled}
                onChange={(e) =>
                  updateDay(day.dayOfWeek, { startTime: e.target.value || null })
                }
                className="h-8 w-[120px]"
              />
              <span className="text-muted-foreground">to</span>
              <Input
                type="time"
                value={day.endTime ?? ""}
                disabled={disabled}
                onChange={(e) =>
                  updateDay(day.dayOfWeek, { endTime: e.target.value || null })
                }
                className="h-8 w-[120px]"
              />
            </div>
          ) : (
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Off
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
