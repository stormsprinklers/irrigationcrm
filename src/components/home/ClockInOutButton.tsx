"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type OpenEntry = {
  id: string;
  clockInAt: string;
  durationHours: number;
};

function formatElapsed(clockInAt: string) {
  const ms = Math.max(0, Date.now() - new Date(clockInAt).getTime());
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

export function ClockInOutButton() {
  const [openEntry, setOpenEntry] = useState<OpenEntry | null>(null);
  const [todayHours, setTodayHours] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [elapsed, setElapsed] = useState("00:00:00");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/time-clock");
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to load clock status");
        return;
      }
      setOpenEntry(data.openEntry);
      setTodayHours(data.todayHours ?? 0);
      if (data.openEntry?.clockInAt) {
        setElapsed(formatElapsed(data.openEntry.clockInAt));
      }
    } catch {
      toast.error("Failed to load clock status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!openEntry) return;
    const tick = () => setElapsed(formatElapsed(openEntry.clockInAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [openEntry]);

  async function handleToggle() {
    setToggling(true);
    try {
      const action = openEntry ? "out" : "in";
      const res = await fetch("/api/time-clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Clock action failed");
        return;
      }
      setOpenEntry(data.openEntry);
      if (action === "out") {
        toast.success("Clocked out");
      } else {
        toast.success("Clocked in");
      }
      await load();
    } finally {
      setToggling(false);
    }
  }

  const isClockedIn = Boolean(openEntry);

  return (
    <Card className="mb-6">
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-full ${
              isClockedIn ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
            }`}
          >
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium">
              {loading ? "Loading..." : isClockedIn ? "On the clock" : "Not clocked in"}
            </p>
            {isClockedIn ? (
              <p className="font-mono text-2xl font-semibold tabular-nums text-green-700">{elapsed}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Today: {todayHours.toFixed(2)} hours logged
              </p>
            )}
          </div>
        </div>
        <Button
          type="button"
          size="lg"
          disabled={loading || toggling}
          className={
            isClockedIn
              ? "bg-green-600 text-white hover:bg-green-700"
              : undefined
          }
          variant={isClockedIn ? "default" : "secondary"}
          onClick={handleToggle}
        >
          {toggling ? "..." : isClockedIn ? "Clock Out" : "Clock In"}
        </Button>
      </CardContent>
    </Card>
  );
}
