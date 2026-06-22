"use client";

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

export function TimeTrackingBar({ status, timeEvents, onEvent, loading, eta }: Props) {
  const lastEvent = timeEvents[timeEvents.length - 1];
  const isPaused = status === "PAUSED";
  const isActive = status === "IN_PROGRESS";
  const canFinish = ["IN_PROGRESS", "PAUSED", "EN_ROUTE"].includes(status);

  return (
    <div className="space-y-2">
      {status === "EN_ROUTE" && eta ? (
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

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">
        <Button
          variant={status === "EN_ROUTE" ? "default" : "outline"}
          size="sm"
          disabled={loading || status === "COMPLETED" || status === "CANCELLED"}
          onClick={() => void onEvent("EN_ROUTE")}
        >
          <Car className="h-4 w-4" />
          On my way
        </Button>

        {isPaused ? (
          <Button
            variant="default"
            size="sm"
            disabled={loading}
            onClick={() => void onEvent("RESUME")}
          >
            <Play className="h-4 w-4" />
            Start my time
          </Button>
        ) : (
          <Button
            variant={isActive ? "secondary" : "default"}
            size="sm"
            disabled={loading || status === "COMPLETED" || status === "CANCELLED"}
            onClick={() => void onEvent(isActive ? "PAUSE" : "START")}
          >
            {isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {isActive ? "Pause" : "Start my time"}
          </Button>
        )}

        <Button
          variant="destructive"
          size="sm"
          disabled={loading || !canFinish}
          onClick={() => void onEvent("FINISH")}
        >
          <Square className="h-4 w-4" />
          Finish visit
        </Button>

        {lastEvent ? (
          <span className={cn("ml-auto text-xs text-muted-foreground")}>
            Last: {lastEvent.type.replace("_", " ").toLowerCase()} at{" "}
            {new Date(lastEvent.occurredAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        ) : null}
      </div>
    </div>
  );
}
