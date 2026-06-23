"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  HousecallProMigrationStatus,
  HousecallProMigrationStepStatus,
  HousecallProMigrationStepType,
} from "@prisma/client";
import { CheckCircle2, Loader2, Pause, Play, RefreshCw, RotateCcw, SkipForward } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MIGRATION_STEP_ORDER, STEP_LABELS } from "@/lib/housecall-pro/constants";
import { cn } from "@/lib/utils";

type MigrationStep = {
  id: string;
  step: HousecallProMigrationStepType;
  status: HousecallProMigrationStepStatus;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  totalEstimate: number | null;
  lastError: string | null;
  statsJson: { recentErrors?: string[] } | null;
};

type Migration = {
  id: string;
  status: HousecallProMigrationStatus;
  currentStep: HousecallProMigrationStepType;
  previewJson: Record<string, unknown> | null;
  steps: MigrationStep[];
};

type StatusResponse = {
  configured: boolean;
  migration: Migration;
};

function stepBadgeVariant(status: HousecallProMigrationStepStatus) {
  switch (status) {
    case HousecallProMigrationStepStatus.COMPLETED:
      return "default" as const;
    case HousecallProMigrationStepStatus.RUNNING:
      return "secondary" as const;
    case HousecallProMigrationStepStatus.FAILED:
      return "destructive" as const;
    case HousecallProMigrationStepStatus.SKIPPED:
      return "outline" as const;
    default:
      return "outline" as const;
  }
}

function canFocusStep(status: HousecallProMigrationStepStatus | undefined) {
  return (
    status === HousecallProMigrationStepStatus.SKIPPED ||
    status === HousecallProMigrationStepStatus.COMPLETED ||
    status === HousecallProMigrationStepStatus.FAILED ||
    status === HousecallProMigrationStepStatus.PENDING
  );
}

function stepProgress(step: MigrationStep) {
  if (!step.totalEstimate) return step.status === HousecallProMigrationStepStatus.COMPLETED ? 100 : 0;
  return Math.min(100, Math.round((step.processed / step.totalEstimate) * 100));
}

export function HousecallProMigrationPanel() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoContinue, setAutoContinue] = useState(false);
  const [runningBatch, setRunningBatch] = useState(false);
  const [rollbackConfirm, setRollbackConfirm] = useState("");
  const [rollingBack, setRollingBack] = useState(false);
  const autoContinueRef = useRef(false);
  const currentStepCardRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/migrations/housecall-pro");
    if (!res.ok) throw new Error("Failed to load migration status");
    return (await res.json()) as StatusResponse;
  }, []);

  const refresh = useCallback(async () => {
    const next = await load();
    setData(next);
    return next;
  }, [load]);

  useEffect(() => {
    refresh()
      .catch(() => toast.error("Failed to load migration"))
      .finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    autoContinueRef.current = autoContinue;
  }, [autoContinue]);

  useEffect(() => {
    if (!autoContinue || !data?.migration) return;
    const interval = setInterval(() => {
      refresh().catch(() => undefined);
    }, 2000);
    return () => clearInterval(interval);
  }, [autoContinue, data?.migration, refresh]);

  async function runBatch(step: HousecallProMigrationStepType) {
    setRunningBatch(true);
    try {
      const res = await fetch(`/api/migrations/housecall-pro/steps/${step}/batch`, {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Batch failed");
      await refresh();
      if (body.errors?.length) {
        toast.message(`Batch finished with ${body.errors.length} error(s)`);
      }
      return body as { done: boolean };
    } finally {
      setRunningBatch(false);
    }
  }

  async function handleRollback() {
    if (
      !confirm(
        "This permanently deletes all customers, jobs, invoices, and other records imported from Housecall Pro. Continue?"
      )
    ) {
      return;
    }
    setRollingBack(true);
    try {
      const res = await fetch("/api/migrations/housecall-pro/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: rollbackConfirm, migrationId: migration?.id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Rollback failed");
      const totalDeleted = Object.values(body.deleted ?? {}).reduce(
        (sum: number, n) => sum + (typeof n === "number" ? n : 0),
        0
      );
      toast.success(`Rollback complete — removed ${totalDeleted} imported records`);
      if (body.errors?.length) {
        toast.message(`${body.errors.length} record(s) could not be deleted`);
      }
      setRollbackConfirm("");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rollback failed");
    } finally {
      setRollingBack(false);
    }
  }

  async function handleStart() {
    try {
      const res = await fetch("/api/migrations/housecall-pro/start", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to start");
      toast.success("Migration started");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start");
    }
  }

  async function handlePause() {
    autoContinueRef.current = false;
    setAutoContinue(false);
    try {
      const res = await fetch("/api/migrations/housecall-pro/pause", { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Migration paused");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to pause");
    }
  }

  async function handleResume() {
    try {
      const res = await fetch("/api/migrations/housecall-pro/resume", { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Migration resumed");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resume");
    }
  }

  async function handleAdvance() {
    try {
      const res = await fetch("/api/migrations/housecall-pro/advance", { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Moved to next step");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to advance");
    }
  }

  async function handleSkip(step: HousecallProMigrationStepType) {
    if (!confirm(`Skip ${STEP_LABELS[step]}?`)) return;
    try {
      const res = await fetch(`/api/migrations/housecall-pro/steps/${step}/skip`, {
        method: "POST",
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Step skipped");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to skip");
    }
  }

  async function handleFocus(
    step: HousecallProMigrationStepType,
    currentMigration: Migration | null | undefined
  ) {
    if (!currentMigration || currentMigration.currentStep === step) return;
    try {
      const res = await fetch(`/api/migrations/housecall-pro/steps/${step}/focus`, {
        method: "POST",
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await refresh();
      toast.success(`Now on ${STEP_LABELS[step]}`);
      currentStepCardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to open step");
    }
  }

  async function handleReset(step: HousecallProMigrationStepType) {
    if (!confirm(`Reset ${STEP_LABELS[step]} and re-import?`)) return;
    try {
      const res = await fetch(`/api/migrations/housecall-pro/steps/${step}/reset`, {
        method: "POST",
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Step reset");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset");
    }
  }

  async function handleRunNextBatch() {
    if (!data?.migration) return;
    const step = data.migration.currentStep;
    if (step === HousecallProMigrationStepType.CONNECT) return;
    try {
      await runBatch(step);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Batch failed");
    }
  }

  async function handleAutoContinue() {
    if (!data?.migration) return;
    autoContinueRef.current = true;
    setAutoContinue(true);

    try {
      while (autoContinueRef.current) {
        const latest = await refresh();
        const migration = latest?.migration;
        if (!migration) break;
        if (migration.status === HousecallProMigrationStatus.PAUSED) break;

        const step = migration.currentStep;
        if (step === HousecallProMigrationStepType.CONNECT) break;

        const stepRow = migration.steps.find((s) => s.step === step);
        if (
          stepRow?.status === HousecallProMigrationStepStatus.COMPLETED ||
          stepRow?.status === HousecallProMigrationStepStatus.SKIPPED
        ) {
          const adv = await fetch("/api/migrations/housecall-pro/advance", { method: "POST" });
          if (!adv.ok) break;
          await refresh();
          continue;
        }

        const body = await runBatch(step);
        if (!body) break;

        if (body.done) {
          const adv = await fetch("/api/migrations/housecall-pro/advance", { method: "POST" });
          if (!adv.ok) break;
          const after = await refresh();
          if (after?.migration?.status === HousecallProMigrationStatus.COMPLETED) break;
          continue;
        }

        await new Promise((r) => setTimeout(r, 300));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Auto-continue stopped");
    } finally {
      autoContinueRef.current = false;
      setAutoContinue(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading migration...
      </div>
    );
  }

  const migration = data?.migration;
  const preview = (migration?.previewJson ?? {}) as Record<string, number | string | boolean>;
  const activeStep = migration?.steps.find((s) => s.step === migration.currentStep);
  const isPaused = migration?.status === HousecallProMigrationStatus.PAUSED;
  const isFailed = migration?.status === HousecallProMigrationStatus.FAILED;
  const isActive =
    migration?.status === HousecallProMigrationStatus.IN_PROGRESS ||
    migration?.status === HousecallProMigrationStatus.PAUSED ||
    migration?.status === HousecallProMigrationStatus.FAILED;
  const stepComplete =
    activeStep?.status === HousecallProMigrationStepStatus.COMPLETED ||
    activeStep?.status === HousecallProMigrationStepStatus.SKIPPED;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Housecall Pro connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={data?.configured ? "default" : "destructive"}>
              {data?.configured ? "API key configured" : "HOUSECALL_PRO_API_KEY missing"}
            </Badge>
            {preview.companyName ? (
              <span className="text-sm text-muted-foreground">{String(preview.companyName)}</span>
            ) : null}
          </div>

          {preview.connected ? (
            <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["Customers", preview.customers],
                ["Jobs", preview.jobs],
                ["Estimates", preview.estimates],
                ["Invoices", preview.invoices],
                ["Employees", preview.employees],
                ["Services", preview.services],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-md border px-3 py-2">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="font-medium">{value ?? "—"}</div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {!isActive ? (
              <Button onClick={handleStart} disabled={!data?.configured || runningBatch}>
                <Play className="mr-2 h-4 w-4" />
                {migration?.status === HousecallProMigrationStatus.FAILED
                  ? "Resume migration"
                  : "Start migration"}
              </Button>
            ) : null}
            {migration?.status === HousecallProMigrationStatus.IN_PROGRESS ? (
              <Button variant="outline" onClick={handlePause}>
                <Pause className="mr-2 h-4 w-4" />
                Pause
              </Button>
            ) : null}
            {isPaused || isFailed ? (
              <Button variant="outline" onClick={handleResume}>
                <Play className="mr-2 h-4 w-4" />
                {isFailed ? "Retry failed step" : "Resume"}
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => refresh().catch(() => toast.error("Refresh failed"))}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {migration && isActive ? (
        <Card ref={currentStepCardRef}>
          <CardHeader>
            <CardTitle className="text-base">
              Current step: {STEP_LABELS[migration.currentStep]}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeStep ? (
              <>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${stepProgress(activeStep)}%` }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
                  <div>Processed: {activeStep.processed}</div>
                  <div>Created: {activeStep.created}</div>
                  <div>Updated: {activeStep.updated}</div>
                  <div>Skipped: {activeStep.skipped}</div>
                  <div>Failed: {activeStep.failed}</div>
                </div>
                {activeStep.lastError ? (
                  <p className="text-sm text-destructive">{activeStep.lastError}</p>
                ) : null}
                {activeStep.statsJson?.recentErrors?.length ? (
                  <ul className="max-h-32 overflow-auto rounded-md border p-3 text-xs text-muted-foreground">
                    {activeStep.statsJson.recentErrors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {migration.currentStep !== HousecallProMigrationStepType.CONNECT ? (
                <>
                  <Button onClick={handleRunNextBatch} disabled={runningBatch}>
                    {runningBatch ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="mr-2 h-4 w-4" />
                    )}
                    Run next batch
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={handleAutoContinue}
                    disabled={runningBatch || autoContinue || isPaused}
                  >
                    {autoContinue ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Auto-continuing…
                      </>
                    ) : (
                      "Auto-continue"
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleSkip(migration.currentStep)}
                    disabled={runningBatch}
                  >
                    <SkipForward className="mr-2 h-4 w-4" />
                    Skip step
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleReset(migration.currentStep)}
                    disabled={runningBatch}
                  >
                    Reset step
                  </Button>
                </>
              ) : null}
              {stepComplete ? (
                <Button variant="default" onClick={handleAdvance}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Continue to next step
                </Button>
              ) : null}
            </div>
            {isPaused ? (
              <p className="text-xs text-muted-foreground">
                Migration is paused. Click any skipped or completed step below to return to it, or
                run batches on the current step.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Click a skipped or completed step in the list below to return to it.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Migration steps</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {MIGRATION_STEP_ORDER.filter((s) => s !== HousecallProMigrationStepType.CONNECT).map(
            (step) => {
              const row = migration?.steps.find((s) => s.step === step);
              const isCurrent = migration?.currentStep === step;
              const isSkipped = row?.status === HousecallProMigrationStepStatus.SKIPPED;
              const focusable =
                isActive && !isCurrent && canFocusStep(row?.status);
              return (
                <div
                  key={step}
                  role={focusable ? "button" : undefined}
                  tabIndex={focusable ? 0 : undefined}
                  onClick={() => {
                    if (focusable && !runningBatch) void handleFocus(step, migration);
                  }}
                  onKeyDown={(e) => {
                    if (focusable && !runningBatch && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      void handleFocus(step, migration);
                    }
                  }}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 transition-colors",
                    isCurrent ? "border-primary bg-muted/30" : "",
                    focusable
                      ? "cursor-pointer hover:border-primary/50 hover:bg-muted/20"
                      : ""
                  )}
                >
                  <div>
                    <div className="font-medium">{STEP_LABELS[step]}</div>
                    {row ? (
                      <div className="text-xs text-muted-foreground">
                        {row.processed}
                        {row.totalEstimate ? ` / ${row.totalEstimate}` : ""} processed · created{" "}
                        {row.created} · failed {row.failed}
                      </div>
                    ) : null}
                    {focusable ? (
                      <div className="mt-1 text-xs text-primary">Click to open this step</div>
                    ) : null}
                  </div>
                  <div
                    className="flex flex-wrap items-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isActive && isSkipped ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={runningBatch}
                          onClick={() => void handleFocus(step, migration)}
                        >
                          <RotateCcw className="mr-1 h-3 w-3" />
                          Retry
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={runningBatch}
                          onClick={() => void handleReset(step)}
                        >
                          Reset
                        </Button>
                      </>
                    ) : null}
                    <Badge variant={row ? stepBadgeVariant(row.status) : "outline"}>
                      {row?.status ?? "PENDING"}
                    </Badge>
                  </div>
                </div>
              );
            }
          )}
        </CardContent>
      </Card>

      {migration?.status === HousecallProMigrationStatus.COMPLETED ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Migration complete</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/customers">View customers</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/schedule">View schedule</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/price-book">View price book</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Roll back imported data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Deletes all records tracked by this Housecall Pro migration (customers, visits, invoices,
            estimates, price book items, etc.) and resets migration progress. This cannot be undone.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[200px] flex-1">
              <label className="text-xs font-medium text-muted-foreground">
                Type ROLLBACK to confirm
              </label>
              <Input
                value={rollbackConfirm}
                onChange={(e) => setRollbackConfirm(e.target.value)}
                placeholder="ROLLBACK"
                className="mt-1"
              />
            </div>
            <Button
              variant="destructive"
              disabled={rollingBack || rollbackConfirm !== "ROLLBACK"}
              onClick={() => void handleRollback()}
            >
              {rollingBack ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="mr-2 h-4 w-4" />
              )}
              Roll back migration data
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
