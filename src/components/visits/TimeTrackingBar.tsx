"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { Car, Pause, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TimeEvent = {
  id: string;
  type: "EN_ROUTE" | "START" | "PAUSE" | "RESUME" | "FINISH";
  occurredAt: string;
};

export type VisitEtaDisplay = {
  minutes: number;
  arrivalAt: string;
  calculatedAt: string | null;
};

type Props = {
  status: string;
  timeEvents: TimeEvent[];
  onEvent: (type: TimeEvent["type"]) => Promise<void>;
  loading?: boolean;
  eta?: VisitEtaDisplay | null;
};

function findLatestEvent(events: TimeEvent[], type: TimeEvent["type"]) {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === type) return events[i];
  }
  return null;
}

function findFirstEvent(events: TimeEvent[], type: TimeEvent["type"]) {
  return events.find((event) => event.type === type) ?? null;
}

function formatDuration(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatEventTimestamp(iso: string) {
  return format(new Date(iso), "MMM d, yyyy h:mm a");
}

function computeWorkSeconds(events: TimeEvent[], now: Date, includeOpenSegment: boolean) {
  let workMs = 0;
  let segmentStart: Date | null = null;

  for (const event of events) {
    const at = new Date(event.occurredAt);
    if (event.type === "START" || event.type === "RESUME") {
      segmentStart = at;
    }
    if ((event.type === "PAUSE" || event.type === "FINISH") && segmentStart) {
      workMs += at.getTime() - segmentStart.getTime();
      segmentStart = null;
    }
  }

  if (includeOpenSegment && segmentStart) {
    workMs += now.getTime() - segmentStart.getTime();
  }

  return Math.floor(workMs / 1000);
}

function computeEnRouteSeconds(events: TimeEvent[], status: string, now: Date) {
  const enRouteEvent = findLatestEvent(events, "EN_ROUTE");
  if (!enRouteEvent) return 0;

  const enRouteAt = new Date(enRouteEvent.occurredAt);
  let endedAt: Date | null = null;

  for (const event of events) {
    const at = new Date(event.occurredAt);
    if (at <= enRouteAt) continue;
    if (event.type === "START" || event.type === "RESUME" || event.type === "FINISH") {
      endedAt = at;
      break;
    }
  }

  if (status === "EN_ROUTE" && !endedAt) {
    return Math.floor((now.getTime() - enRouteAt.getTime()) / 1000);
  }

  if (endedAt) {
    return Math.floor((endedAt.getTime() - enRouteAt.getTime()) / 1000);
  }

  return 0;
}

function useLiveTick(active: boolean) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!active) {
      setNow(new Date());
      return;
    }
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [active]);

  return now;
}

type StepProps = {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  activeClassName?: string;
  counter?: string | null;
  timestamp?: string | null;
  timestampLabel?: string;
  secondaryTimestamp?: string | null;
  secondaryTimestampLabel?: string;
};

function TimeTrackingStep({
  label,
  icon,
  onClick,
  disabled,
  active,
  activeClassName,
  counter,
  timestamp,
  timestampLabel,
  secondaryTimestamp,
  secondaryTimestampLabel,
}: StepProps) {
  return (
    <div className="flex min-w-[8.5rem] flex-1 flex-col items-stretch gap-1">
      <Button
        type="button"
        variant={active ? "default" : "outline"}
        size="sm"
        disabled={disabled}
        onClick={onClick}
        className={cn("w-full", active && activeClassName, active && "ring-2 ring-offset-2")}
      >
        {icon}
        {label}
      </Button>
      {counter ? (
        <p className="text-center font-mono text-sm font-semibold tabular-nums text-foreground">
          {counter}
        </p>
      ) : null}
      {timestamp ? (
        <p className="px-0.5 text-center text-[11px] leading-snug text-muted-foreground">
          {timestampLabel ? `${timestampLabel} ` : null}
          {timestamp}
        </p>
      ) : null}
      {secondaryTimestamp ? (
        <p className="px-0.5 text-center text-[11px] leading-snug text-muted-foreground">
          {secondaryTimestampLabel ? `${secondaryTimestampLabel} ` : null}
          {secondaryTimestamp}
        </p>
      ) : null}
    </div>
  );
}

export function TimeTrackingBar({ status, timeEvents, onEvent, loading, eta }: Props) {
  const isPaused = status === "PAUSED";
  const isWorking = status === "IN_PROGRESS";
  const isEnRoute = status === "EN_ROUTE";
  const isCompleted = status === "COMPLETED" || status === "CANCELLED";
  const canFinish = ["IN_PROGRESS", "PAUSED", "EN_ROUTE"].includes(status);

  const enRouteEvent = findLatestEvent(timeEvents, "EN_ROUTE");
  const startEvent = findFirstEvent(timeEvents, "START");
  const pauseEvent = findLatestEvent(timeEvents, "PAUSE");
  const finishEvent = findLatestEvent(timeEvents, "FINISH");

  const tickActive = isEnRoute || isWorking;
  const now = useLiveTick(tickActive);

  const enRouteCounter = useMemo(() => {
    if (!isEnRoute) return null;
    return formatDuration(computeEnRouteSeconds(timeEvents, status, now));
  }, [isEnRoute, now, status, timeEvents]);

  const workCounter = useMemo(() => {
    if (!isWorking && !isPaused) return null;
    return formatDuration(
      computeWorkSeconds(timeEvents, now, isWorking)
    );
  }, [isPaused, isWorking, now, timeEvents]);

  return (
    <div className="space-y-2">
      {isEnRoute && eta ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <p className="font-medium text-foreground">
            Arriving in ~{eta.minutes} min (about{" "}
            {format(new Date(eta.arrivalAt), "h:mm a")})
          </p>
          {eta.calculatedAt ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Updated {format(new Date(eta.calculatedAt), "h:mm a")}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3 rounded-lg border bg-muted/30 p-3">
        <TimeTrackingStep
          label="On my way"
          icon={<Car className="h-4 w-4" />}
          disabled={loading || isCompleted}
          active={isEnRoute}
          activeClassName="bg-primary ring-primary hover:bg-primary/90"
          counter={enRouteCounter}
          timestamp={enRouteEvent ? formatEventTimestamp(enRouteEvent.occurredAt) : null}
          timestampLabel={enRouteEvent ? "Left at" : undefined}
          onClick={() => void onEvent("EN_ROUTE")}
        />

        {isPaused ? (
          <TimeTrackingStep
            label="Resume"
            icon={<Play className="h-4 w-4" />}
            disabled={loading}
            active
            activeClassName="bg-amber-500 ring-amber-500 hover:bg-amber-500/90 text-white"
            counter={workCounter}
            timestamp={
              startEvent ? formatEventTimestamp(startEvent.occurredAt) : null
            }
            timestampLabel={startEvent ? "Started at" : undefined}
            secondaryTimestamp={
              pauseEvent ? formatEventTimestamp(pauseEvent.occurredAt) : null
            }
            secondaryTimestampLabel={pauseEvent ? "Paused at" : undefined}
            onClick={() => void onEvent("RESUME")}
          />
        ) : (
          <TimeTrackingStep
            label={isWorking ? "Pause" : "Start my time"}
            icon={isWorking ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            disabled={loading || isCompleted}
            active={isWorking}
            activeClassName="bg-green-600 ring-green-600 hover:bg-green-600/90 text-white"
            counter={workCounter}
            timestamp={
              startEvent ? formatEventTimestamp(startEvent.occurredAt) : null
            }
            timestampLabel={startEvent ? "Started at" : undefined}
            onClick={() => void onEvent(isWorking ? "PAUSE" : "START")}
          />
        )}

        <TimeTrackingStep
          label="Finish visit"
          icon={<Square className="h-4 w-4" />}
          disabled={loading || !canFinish}
          active={isCompleted && Boolean(finishEvent)}
          activeClassName="bg-destructive ring-destructive hover:bg-destructive/90"
          timestamp={finishEvent ? formatEventTimestamp(finishEvent.occurredAt) : null}
          timestampLabel={finishEvent ? "Finished at" : undefined}
          onClick={() => void onEvent("FINISH")}
        />
      </div>
    </div>
  );
}
