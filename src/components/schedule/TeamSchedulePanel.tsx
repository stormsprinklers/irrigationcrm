"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  addWeeks,
  eachDayOfInterval,
  endOfWeek,
  format,
  subWeeks,
} from "date-fns";
import { ArrowLeft, CalendarOff, Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { TimeOffRequestDTO, WorkScheduleDayDTO } from "@/lib/schedule/time-off-types";

type Employee = {
  id: string;
  name: string;
  color?: string | null;
};

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const TIME_OFF_TYPE_LABELS: Record<string, string> = {
  TIME_OFF: "Time off",
  PTO: "PTO",
  SICK: "Sick",
  OTHER: "Other",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  APPROVED: "default",
  PENDING: "secondary",
  DENIED: "destructive",
  CANCELLED: "outline",
};

type Props = {
  weekStart: Date;
  onWeekChange: (weekStart: Date) => void;
  employees: Employee[];
  onClose: () => void;
};

export function TeamSchedulePanel({ weekStart, onWeekChange, employees, onClose }: Props) {
  const { data: session } = useSession();
  const role = session?.user?.role ?? "TECH";
  const canManage = role === "ADMIN" || role === "MANAGER" || role === "CSR";

  const defaultUserId = useMemo(() => {
    if (!canManage && session?.user?.id) return session.user.id;
    return employees[0]?.id ?? session?.user?.id ?? "";
  }, [canManage, employees, session?.user?.id]);

  const [selectedUserId, setSelectedUserId] = useState("");
  const [workSchedule, setWorkSchedule] = useState<WorkScheduleDayDTO[]>([]);
  const [timeOff, setTimeOff] = useState<TimeOffRequestDTO[]>([]);
  const [pendingRequests, setPendingRequests] = useState<TimeOffRequestDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestForm, setRequestForm] = useState({
    startDate: format(new Date(), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
    allDay: true,
    type: "TIME_OFF",
    reason: "",
  });

  const weekEnd = useMemo(() => endOfWeek(weekStart, { weekStartsOn: 0 }), [weekStart]);
  const weekDays = useMemo(
    () => eachDayOfInterval({ start: weekStart, end: weekEnd }),
    [weekStart, weekEnd]
  );

  const weekLabel = useMemo(() => {
    return `${format(weekStart, "MMM d")} – ${format(weekEnd, "MMM d, yyyy")}`;
  }, [weekStart, weekEnd]);

  const loadEmployeeData = useCallback(async () => {
    if (!selectedUserId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        userId: selectedUserId,
        start: weekStart.toISOString(),
        end: new Date(weekEnd.getTime() + 1).toISOString(),
      });
      const res = await fetch(`/api/schedule/team?${params}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setWorkSchedule(data.workSchedule ?? []);
      setTimeOff(data.timeOff ?? []);
    } catch {
      toast.error("Failed to load team schedule");
    } finally {
      setLoading(false);
    }
  }, [selectedUserId, weekStart, weekEnd]);

  const loadPending = useCallback(async () => {
    if (!canManage) return;
    try {
      const res = await fetch("/api/schedule/time-off/pending");
      if (res.ok) {
        const data = await res.json();
        setPendingRequests(data.requests ?? []);
      }
    } catch {
      // ignore
    }
  }, [canManage]);

  useEffect(() => {
    if (!selectedUserId && defaultUserId) {
      setSelectedUserId(defaultUserId);
    }
  }, [defaultUserId, selectedUserId]);

  useEffect(() => {
    loadEmployeeData();
  }, [loadEmployeeData]);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  async function saveWorkSchedule() {
    if (!canManage || !selectedUserId) return;
    setSavingSchedule(true);
    try {
      const res = await fetch("/api/schedule/team", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId, days: workSchedule }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save");
      }
      toast.success("Work schedule saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save work schedule");
    } finally {
      setSavingSchedule(false);
    }
  }

  async function submitTimeOffRequest() {
    if (!selectedUserId) return;
    setSubmittingRequest(true);
    try {
      const startAt = new Date(`${requestForm.startDate}T00:00:00`);
      const endAt = new Date(`${requestForm.endDate}T23:59:59`);
      const res = await fetch("/api/schedule/time-off", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: canManage ? selectedUserId : undefined,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          allDay: requestForm.allDay,
          type: requestForm.type,
          reason: requestForm.reason || undefined,
          approveImmediately: canManage,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to submit");
      }
      toast.success(canManage ? "Time off added" : "Time off request submitted");
      setRequestForm((f) => ({ ...f, reason: "" }));
      await loadEmployeeData();
      await loadPending();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit request");
    } finally {
      setSubmittingRequest(false);
    }
  }

  async function reviewRequest(id: string, status: "APPROVED" | "DENIED") {
    try {
      const res = await fetch(`/api/schedule/time-off/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update");
      toast.success(status === "APPROVED" ? "Request approved" : "Request denied");
      await loadPending();
      await loadEmployeeData();
    } catch {
      toast.error("Failed to update request");
    }
  }

  function updateWorkDay(dayOfWeek: number, patch: Partial<WorkScheduleDayDTO>) {
    setWorkSchedule((days) =>
      days.map((day) => (day.dayOfWeek === dayOfWeek ? { ...day, ...patch } : day))
    );
  }

  function timeOffForDay(day: Date) {
    const dayStart = new Date(day);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setHours(23, 59, 59, 999);
    return timeOff.filter((entry) => {
      const start = new Date(entry.startAt);
      const end = new Date(entry.endAt);
      return start <= dayEnd && end >= dayStart;
    });
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Job schedule
          </Button>
          <CalendarOff className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">Team schedules</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onWeekChange(subWeeks(weekStart, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">{weekLabel}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onWeekChange(addWeeks(weekStart, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Employee</label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="h-9 min-w-[200px] rounded-md border border-input bg-transparent px-3 text-sm"
                disabled={!canManage && employees.length <= 1}
              >
                {(canManage ? employees : employees.filter((e) => e.id === session?.user?.id)).map(
                  (employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name}
                    </option>
                  )
                )}
              </select>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <div className="grid gap-6 xl:grid-cols-2">
              <section className="rounded-lg border border-border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold">Work days</h3>
                  {canManage ? (
                    <Button size="sm" onClick={saveWorkSchedule} disabled={savingSchedule}>
                      {savingSchedule ? "Saving..." : "Save schedule"}
                    </Button>
                  ) : null}
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                  Set which days this employee works. Non-working days block job assignments.
                </p>
                <div className="space-y-2">
                  {workSchedule.map((day) => (
                    <div
                      key={day.dayOfWeek}
                      className="flex flex-wrap items-center gap-3 rounded-md border border-border/60 px-3 py-2"
                    >
                      <label className="flex min-w-[120px] items-center gap-2 text-sm">
                        <Checkbox
                          checked={day.isWorking}
                          disabled={!canManage}
                          onCheckedChange={(checked) =>
                            updateWorkDay(day.dayOfWeek, { isWorking: checked === true })
                          }
                        />
                        {DAY_LABELS[day.dayOfWeek]}
                      </label>
                      {day.isWorking ? (
                        <div className="flex items-center gap-2 text-sm">
                          <Input
                            type="time"
                            value={day.startTime ?? ""}
                            disabled={!canManage}
                            onChange={(e) =>
                              updateWorkDay(day.dayOfWeek, { startTime: e.target.value || null })
                            }
                            className="h-8 w-[120px]"
                          />
                          <span className="text-muted-foreground">to</span>
                          <Input
                            type="time"
                            value={day.endTime ?? ""}
                            disabled={!canManage}
                            onChange={(e) =>
                              updateWorkDay(day.dayOfWeek, { endTime: e.target.value || null })
                            }
                            className="h-8 w-[120px]"
                          />
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Off</span>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-border p-4">
                <h3 className="mb-3 font-semibold">Time off this week</h3>
                <div className="mb-4 grid grid-cols-7 gap-1">
                  {weekDays.map((day) => {
                    const entries = timeOffForDay(day);
                    const hasApproved = entries.some((e) => e.status === "APPROVED");
                    const hasPending = entries.some((e) => e.status === "PENDING");
                    return (
                      <div
                        key={day.toISOString()}
                        className={cn(
                          "rounded border border-border p-1 text-center text-[10px]",
                          hasApproved && "border-amber-400 bg-amber-50",
                          !hasApproved && hasPending && "border-blue-300 bg-blue-50"
                        )}
                      >
                        <p className="font-medium">{format(day, "EEE")}</p>
                        <p>{format(day, "d")}</p>
                      </div>
                    );
                  })}
                </div>
                <ul className="mb-4 space-y-2">
                  {timeOff.length === 0 ? (
                    <li className="text-sm text-muted-foreground">No time off this week.</li>
                  ) : (
                    timeOff.map((entry) => (
                      <li
                        key={entry.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                      >
                        <div>
                          <p className="font-medium">
                            {format(new Date(entry.startAt), "MMM d")}
                            {entry.startAt.slice(0, 10) !== entry.endAt.slice(0, 10)
                              ? ` – ${format(new Date(entry.endAt), "MMM d")}`
                              : ""}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {TIME_OFF_TYPE_LABELS[entry.type] ?? entry.type}
                            {entry.reason ? ` · ${entry.reason}` : ""}
                          </p>
                        </div>
                        <Badge variant={STATUS_VARIANT[entry.status] ?? "outline"}>{entry.status}</Badge>
                      </li>
                    ))
                  )}
                </ul>

                <div className="rounded-md border border-dashed border-border p-3">
                  <h4 className="mb-2 text-sm font-semibold">
                    {canManage ? "Add time off" : "Request time off"}
                  </h4>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      type="date"
                      value={requestForm.startDate}
                      onChange={(e) => setRequestForm({ ...requestForm, startDate: e.target.value })}
                    />
                    <Input
                      type="date"
                      value={requestForm.endDate}
                      onChange={(e) => setRequestForm({ ...requestForm, endDate: e.target.value })}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <select
                      value={requestForm.type}
                      onChange={(e) => setRequestForm({ ...requestForm, type: e.target.value })}
                      className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                    >
                      {Object.entries(TIME_OFF_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={requestForm.allDay}
                        onCheckedChange={(checked) =>
                          setRequestForm({ ...requestForm, allDay: checked === true })
                        }
                      />
                      All day
                    </label>
                  </div>
                  <Input
                    placeholder="Reason (optional)"
                    value={requestForm.reason}
                    onChange={(e) => setRequestForm({ ...requestForm, reason: e.target.value })}
                    className="mt-2"
                  />
                  <Button
                    className="mt-3"
                    size="sm"
                    onClick={submitTimeOffRequest}
                    disabled={submittingRequest}
                  >
                    {submittingRequest
                      ? "Submitting..."
                      : canManage
                        ? "Add time off"
                        : "Submit request"}
                  </Button>
                </div>
              </section>
            </div>
          )}
        </div>

        {canManage ? (
          <aside className="w-80 shrink-0 overflow-y-auto border-l border-border bg-muted/20 p-4">
            <h3 className="mb-3 font-semibold">Pending approvals</h3>
            {pendingRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending requests.</p>
            ) : (
              <ul className="space-y-3">
                {pendingRequests.map((request) => (
                  <li key={request.id} className="rounded-lg border border-border bg-white p-3 text-sm">
                    <p className="font-medium">{request.userName}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(request.startAt), "MMM d, yyyy")}
                      {request.startAt.slice(0, 10) !== request.endAt.slice(0, 10)
                        ? ` – ${format(new Date(request.endAt), "MMM d, yyyy")}`
                        : ""}
                    </p>
                    {request.reason ? (
                      <p className="mt-1 text-xs">{request.reason}</p>
                    ) : null}
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" onClick={() => reviewRequest(request.id, "APPROVED")}>
                        <Check className="mr-1 h-3 w-3" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => reviewRequest(request.id, "DENIED")}
                      >
                        <X className="mr-1 h-3 w-3" />
                        Deny
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
