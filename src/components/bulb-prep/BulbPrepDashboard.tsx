"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, CircleDot, MapPin } from "lucide-react";
import { toast } from "sonner";
import { ClockInOutButton } from "@/components/home/ClockInOutButton";
import { ContentArea } from "@/components/layout/ContentArea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

type BulbPrepJob = {
  id: string;
  title: string;
  customerName: string;
  city: string;
  startAt: string;
  dateLabel: string;
  timeLabel: string;
  bulbColor: string;
  strandColor: string;
  linearFeet: number | null;
  completed: boolean;
  completedAt: string | null;
  completedBy: string | null;
};

export function BulbPrepDashboard({ name }: { name: string }) {
  const [jobs, setJobs] = useState<BulbPrepJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState(90);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/bulb-prep/jobs", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Failed to load upcoming jobs");
      setJobs(data.jobs ?? []);
      setWindowDays(data.windowDays ?? 90);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load upcoming jobs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const completedCount = useMemo(
    () => jobs.filter((job) => job.completed).length,
    [jobs]
  );
  const readyPercent = jobs.length ? Math.round((completedCount / jobs.length) * 100) : 0;

  async function setCompleted(job: BulbPrepJob, completed: boolean) {
    if (busyId) return;
    setBusyId(job.id);
    try {
      const response = await fetch("/api/bulb-prep/jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitId: job.id, completed }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not update this job");
      setJobs((current) =>
        current.map((item) =>
          item.id === job.id
            ? {
                ...item,
                completed: Boolean(data.completed),
                completedAt: data.completedAt ?? null,
                completedBy: data.completedBy ?? null,
              }
            : item
        )
      );
      toast.success(completed ? "Bulbs marked ready" : "Job returned to the prep list");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update this job");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <ContentArea className="mx-auto max-w-5xl pb-10">
      <div className="mb-6">
        <p className="text-sm font-medium text-primary">Bulb Prep</p>
        <h1 className="text-3xl font-semibold tracking-tight">Hi, {name || "there"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Clock in, prepare each upcoming holiday-lighting job, and check it off when it is ready.
        </p>
      </div>

      <ClockInOutButton />

      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              Upcoming holiday jobs
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Next {windowDays} days · {completedCount} of {jobs.length} ready
            </p>
          </div>
          <div className="min-w-40">
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>Prep progress</span>
              <span>{readyPercent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-green-600 transition-[width]"
                style={{ width: `${readyPercent}%` }}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Loading prep list…</p>
          ) : jobs.length === 0 ? (
            <div className="py-12 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
              <p className="mt-3 font-medium">No upcoming holiday jobs</p>
              <p className="mt-1 text-sm text-muted-foreground">The prep checklist is clear.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <label
                  key={job.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors",
                    job.completed
                      ? "border-green-200 bg-green-50/70 dark:border-green-900 dark:bg-green-950/30"
                      : "bg-card hover:bg-muted/30",
                    busyId === job.id && "opacity-60"
                  )}
                >
                  <Checkbox
                    className="mt-1 h-5 w-5"
                    checked={job.completed}
                    disabled={Boolean(busyId)}
                    onCheckedChange={(checked) => void setCompleted(job, Boolean(checked))}
                    aria-label={`Mark ${job.customerName} bulb prep ${job.completed ? "not ready" : "ready"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className={cn("font-semibold", job.completed && "text-muted-foreground line-through")}>
                          {job.customerName}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5" />
                          {job.city}
                        </p>
                      </div>
                      <Badge variant={job.completed ? "success" : "outline"}>
                        {job.dateLabel} · {job.timeLabel}
                      </Badge>
                    </div>

                    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                      <div className="rounded-md bg-background/80 px-3 py-2">
                        <span className="block text-xs text-muted-foreground">Bulb color</span>
                        <span className="font-medium">{job.bulbColor}</span>
                      </div>
                      <div className="rounded-md bg-background/80 px-3 py-2">
                        <span className="block text-xs text-muted-foreground">Strand color</span>
                        <span className="font-medium">{job.strandColor}</span>
                      </div>
                      <div className="rounded-md bg-background/80 px-3 py-2">
                        <span className="block text-xs text-muted-foreground">Linear feet</span>
                        <span className="font-medium">
                          {job.linearFeet == null ? "Not specified" : `${job.linearFeet.toLocaleString()} ft`}
                        </span>
                      </div>
                    </div>

                    {job.completed ? (
                      <p className="mt-2 flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Ready{job.completedBy ? ` · checked by ${job.completedBy}` : ""}
                      </p>
                    ) : (
                      <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                        <CircleDot className="h-3.5 w-3.5" />
                        Needs prep
                      </p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </ContentArea>
  );
}
