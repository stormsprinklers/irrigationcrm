"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { DEFAULT_BUSINESS_HOURS, type BusinessHoursDay } from "@/lib/company/types";

const dayKeys = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

type Manager = { id: string; name: string; email: string; role: string };
type Assignment = {
  id: string;
  jobSlug: string;
  jobTitle: string | null;
  hiringManagerUserId: string;
  hiringManager: Manager;
};
type KnownJob = {
  jobSlug: string;
  jobTitle: string | null;
  source?: "website" | "applicant";
  applicationsOpen?: boolean;
};

export default function HiringSetupPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [knownJobs, setKnownJobs] = useState<KnownJob[]>([]);
  const [jobSlug, setJobSlug] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [managerId, setManagerId] = useState("");
  const [availManagerId, setAvailManagerId] = useState("");
  const [weeklyHours, setWeeklyHours] =
    useState<Record<string, BusinessHoursDay>>(DEFAULT_BUSINESS_HOURS);
  const [leadTimeHours, setLeadTimeHours] = useState(2);
  const [previewSlots, setPreviewSlots] = useState<Array<{ startAt: string }>>([]);
  const [timezone, setTimezone] = useState("America/Denver");
  const [loading, setLoading] = useState(true);
  const [savingRole, setSavingRole] = useState(false);
  const [savingAvail, setSavingAvail] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const loadRoles = useCallback(async () => {
    const res = await fetch("/api/hiring/roles");
    if (!res.ok) {
      toast.error("Failed to load hiring setup");
      return;
    }
    const data = await res.json();
    setAssignments(data.assignments ?? []);
    setManagers(data.managers ?? []);
    const jobs: KnownJob[] = data.knownJobs ?? [];
    setKnownJobs(jobs);
    setManagerId((current) => current || data.managers?.[0]?.id || "");
    setAvailManagerId((current) => current || data.managers?.[0]?.id || "");
    setJobSlug((current) => {
      if (current) return current;
      const firstOpen =
        jobs.find((j) => j.applicationsOpen !== false && j.source === "website") ??
        jobs[0];
      if (firstOpen) {
        setJobTitle(firstOpen.jobTitle || "");
        return firstOpen.jobSlug;
      }
      return "";
    });
  }, []);

  const loadAvailability = useCallback(async (userId: string) => {
    if (!userId) return;
    const res = await fetch(`/api/hiring/availability?userId=${encodeURIComponent(userId)}`);
    if (!res.ok) {
      toast.error("Failed to load availability");
      return;
    }
    const data = await res.json();
    setWeeklyHours({ ...DEFAULT_BUSINESS_HOURS, ...(data.weeklyHours ?? {}) });
    setLeadTimeHours(data.leadTimeHours ?? 2);
    setPreviewSlots(data.previewSlots ?? []);
    if (data.timezone) setTimezone(data.timezone);
  }, []);

  useEffect(() => {
    setLoading(true);
    void loadRoles().finally(() => setLoading(false));
  }, [loadRoles]);

  useEffect(() => {
    if (availManagerId) void loadAvailability(availManagerId);
  }, [availManagerId, loadAvailability]);

  function selectJob(slug: string) {
    setJobSlug(slug);
    const match = knownJobs.find((j) => j.jobSlug === slug);
    setJobTitle(match?.jobTitle || "");
  }

  async function saveAssignment() {
    if (!jobSlug.trim() || !managerId) {
      toast.error("Select a website job and hiring manager");
      return;
    }
    setSavingRole(true);
    try {
      const res = await fetch("/api/hiring/roles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobSlug: jobSlug.trim(),
          jobTitle: jobTitle.trim() || null,
          hiringManagerUserId: managerId,
        }),
      });
      if (!res.ok) {
        toast.error("Failed to save role assignment");
        return;
      }
      toast.success("Role assignment saved");
      await loadRoles();
    } finally {
      setSavingRole(false);
    }
  }

  async function syncCareersFromWebsite() {
    setSyncing(true);
    try {
      const res = await fetch("/api/hiring/migrate-careers", { method: "POST" });
      if (!res.ok) {
        toast.error("Failed to sync careers applications");
        return;
      }
      const data = await res.json();
      const s = data.summary ?? {};
      toast.success(
        `Synced: ${s.importedFromWebsite ?? 0} from website, ${s.importedFromLeads ?? 0} from leads` +
          (s.websiteJobs != null ? ` · ${s.websiteJobs} roles on site` : "")
      );
      await loadRoles();
    } finally {
      setSyncing(false);
    }
  }

  async function removeAssignment(slug: string) {
    const res = await fetch(`/api/hiring/roles?jobSlug=${encodeURIComponent(slug)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Failed to remove");
      return;
    }
    toast.success("Removed");
    await loadRoles();
  }

  async function saveAvailability() {
    if (!availManagerId) return;
    setSavingAvail(true);
    try {
      const res = await fetch("/api/hiring/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: availManagerId,
          weeklyHours,
          leadTimeHours,
        }),
      });
      if (!res.ok) {
        toast.error("Failed to save availability");
        return;
      }
      toast.success("Availability saved");
      await loadAvailability(availManagerId);
    } finally {
      setSavingAvail(false);
    }
  }

  if (loading) {
    return (
      <ContentArea>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </ContentArea>
    );
  }

  return (
    <ContentArea className="max-w-3xl">
      <PageHeader
        breadcrumb={["Hiring", "Setup"]}
        title="Hiring setup"
        subtitle="Route website careers roles to managers and set phone-screen availability."
      />

      <section className="mb-8 space-y-4 rounded-lg border border-border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Position → hiring manager</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Roles are loaded from the careers page on the website. Assign each open role to a
              hiring manager; applicants book against that manager&apos;s availability.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void syncCareersFromWebsite()}
            disabled={syncing}
          >
            {syncing ? "Syncing…" : "Sync careers → Hiring"}
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-muted-foreground">Job from website</label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={jobSlug}
              onChange={(e) => selectJob(e.target.value)}
            >
              {!knownJobs.length ? (
                <option value="">No jobs found — check website catalog sync</option>
              ) : (
                knownJobs.map((job) => {
                  const closed = job.applicationsOpen === false;
                  const label = [
                    job.jobTitle || job.jobSlug,
                    closed ? "(applications closed)" : null,
                    job.source === "applicant" && job.applicationsOpen === undefined
                      ? "(from applicant)"
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <option key={job.jobSlug} value={job.jobSlug}>
                      {label}
                    </option>
                  );
                })
              )}
            </select>
            {jobSlug ? (
              <p className="mt-1 text-xs text-muted-foreground">Slug: {jobSlug}</p>
            ) : null}
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-muted-foreground">Hiring manager</label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
            >
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.role})
                </option>
              ))}
            </select>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => void saveAssignment()}
          disabled={savingRole || !jobSlug}
        >
          {savingRole ? "Saving…" : "Save assignment"}
        </Button>

        <ul className="divide-y divide-border rounded-md border border-border">
          {!assignments.length ? (
            <li className="px-3 py-4 text-sm text-muted-foreground">No role assignments yet.</li>
          ) : (
            assignments.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{row.jobTitle || row.jobSlug}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.jobSlug} → {row.hiringManager.name}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void removeAssignment(row.jobSlug)}
                >
                  Remove
                </Button>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-white p-5">
        <h2 className="font-semibold">Phone-screen availability</h2>
        <p className="text-sm text-muted-foreground">
          Set weekly windows for 10-minute screening calls in company time ({timezone}). Booked times
          are removed automatically.
        </p>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Manager</label>
          <select
            className="h-9 w-full max-w-md rounded-md border border-input bg-background px-3 text-sm"
            value={availManagerId}
            onChange={(e) => setAvailManagerId(e.target.value)}
          >
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-3">
          {dayKeys.map((day) => (
            <div key={day} className="flex flex-wrap items-center gap-3 text-sm">
              <span className="w-28 capitalize">{day}</span>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={weeklyHours[day]?.open ?? false}
                  onCheckedChange={(c) =>
                    setWeeklyHours({
                      ...weeklyHours,
                      [day]: { ...weeklyHours[day], open: Boolean(c) },
                    })
                  }
                />
                Open
              </label>
              <input
                type="time"
                className="rounded border border-input px-2 py-1"
                value={weeklyHours[day]?.start ?? "09:00"}
                onChange={(e) =>
                  setWeeklyHours({
                    ...weeklyHours,
                    [day]: { ...weeklyHours[day], start: e.target.value },
                  })
                }
              />
              <span>to</span>
              <input
                type="time"
                className="rounded border border-input px-2 py-1"
                value={weeklyHours[day]?.end ?? "17:00"}
                onChange={(e) =>
                  setWeeklyHours({
                    ...weeklyHours,
                    [day]: { ...weeklyHours[day], end: e.target.value },
                  })
                }
              />
            </div>
          ))}
        </div>

        <div className="max-w-xs">
          <label className="mb-1 block text-xs text-muted-foreground">Lead time (hours)</label>
          <Input
            type="number"
            min={0}
            max={72}
            value={leadTimeHours}
            onChange={(e) => setLeadTimeHours(Number(e.target.value) || 0)}
          />
        </div>

        <Button
          type="button"
          size="sm"
          onClick={() => void saveAvailability()}
          disabled={savingAvail}
        >
          {savingAvail ? "Saving…" : "Save availability"}
        </Button>

        {previewSlots.length ? (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Next open slots
            </p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {previewSlots.slice(0, 8).map((slot) => (
                <li key={slot.startAt}>
                  {new Date(slot.startAt).toLocaleString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: timezone,
                  })}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No upcoming slots with current settings.</p>
        )}
      </section>
    </ContentArea>
  );
}
