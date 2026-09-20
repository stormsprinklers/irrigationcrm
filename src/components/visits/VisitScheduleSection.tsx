"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SchedulePeekModal } from "@/components/schedule/SchedulePeekModal";
import { EmployeeMultiSelect } from "@/components/schedule/EmployeeMultiSelect";
import { blobProxyUrl } from "@/lib/blob/urls";
import type { ScheduleSlotClick } from "@/lib/schedule/quick-add";
import { validateScheduledVisitAssignment } from "@/lib/schedule/visit-assignment";
import type { VisitStatus } from "@prisma/client";

type EmployeeOption = {
  id: string;
  name: string;
  photoUrl?: string | null;
  color?: string | null;
};

type Props = {
  visitId: string;
  title: string;
  startAt: string;
  endAt: string;
  status: string;
  assignedUser: EmployeeOption | null;
  assignedUsers: EmployeeOption[];
  canEdit: boolean;
  onUpdated: () => Promise<void>;
};

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function toDateInput(iso: string) {
  return iso.slice(0, 10);
}

function toTimeInput(iso: string) {
  const d = new Date(iso);
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatTimeLabel(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return "Choose time";
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function TechnicianAvatar({ employee }: { employee: EmployeeOption }) {
  return (
    <Avatar className="h-8 w-8 shrink-0">
      {employee.photoUrl ? (
        <AvatarImage src={blobProxyUrl(employee.photoUrl)} alt={employee.name} />
      ) : null}
      <AvatarFallback
        className="text-xs"
        style={{ backgroundColor: employee.color ?? "#64748B", color: "#fff" }}
      >
        {getInitials(employee.name)}
      </AvatarFallback>
    </Avatar>
  );
}

export function VisitScheduleSection({
  visitId,
  title,
  startAt,
  endAt,
  status,
  assignedUser,
  assignedUsers,
  canEdit,
  onUpdated,
}: Props) {
  const [visitTitle, setVisitTitle] = useState(title);
  const [date, setDate] = useState(toDateInput(startAt));
  const [startTime, setStartTime] = useState(toTimeInput(startAt));
  const [endTime, setEndTime] = useState(toTimeInput(endAt));
  const [assignedUserIds, setAssignedUserIds] = useState<string[]>(
    assignedUsers.length ? assignedUsers.map((employee) => employee.id) : assignedUser ? [assignedUser.id] : []
  );
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  useEffect(() => {
    setVisitTitle(title);
    setDate(toDateInput(startAt));
    setStartTime(toTimeInput(startAt));
    setEndTime(toTimeInput(endAt));
    setAssignedUserIds(
      assignedUsers.length ? assignedUsers.map((employee) => employee.id) : assignedUser ? [assignedUser.id] : []
    );
  }, [title, startAt, endAt, assignedUser, assignedUsers]);

  useEffect(() => {
    if (!canEdit) return;
    fetch("/api/schedule/filters")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setEmployees(data?.employees ?? []))
      .catch(() => {});
  }, [canEdit]);

  const employeeOptions = useMemo(() => {
    const list = [...employees];
    for (const employee of assignedUsers.length ? assignedUsers : assignedUser ? [assignedUser] : []) {
      if (!list.some((option) => option.id === employee.id)) list.unshift(employee);
    }
    return list;
  }, [employees, assignedUser, assignedUsers]);

  const selectedEmployees = assignedUserIds
    .map((id) => employeeOptions.find((employee) => employee.id === id))
    .filter((employee): employee is EmployeeOption => Boolean(employee));

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;

    const nextStart = new Date(`${date}T${startTime}`);
    const nextEnd = new Date(`${date}T${endTime}`);
    if (Number.isNaN(nextStart.getTime()) || Number.isNaN(nextEnd.getTime())) {
      toast.error("Enter a valid date and time");
      return;
    }
    if (nextEnd <= nextStart) {
      toast.error("End time must be after start time");
      return;
    }

    if (!visitTitle.trim()) {
      toast.error("Title is required");
      return;
    }

    const assignmentError = validateScheduledVisitAssignment(
      "SCHEDULED" as VisitStatus,
      assignedUserIds[0] || null
    );
    if (assignmentError) {
      toast.error(assignmentError);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/visits/${visitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: visitTitle.trim(),
          startAt: nextStart.toISOString(),
          endAt: nextEnd.toISOString(),
          assignedUserIds,
          status: "SCHEDULED",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to update schedule");
        return;
      }
      if (data.warning) toast.warning(data.warning);
      toast.success("Schedule updated");
      await onUpdated();
    } finally {
      setSaving(false);
    }
  }

  function applyScheduleSlot(slot: ScheduleSlotClick) {
    const durationMs = (() => {
      const start = new Date(`${date}T${startTime}`);
      const end = new Date(`${date}T${endTime}`);
      const diff = end.getTime() - start.getTime();
      return Number.isFinite(diff) && diff > 0 ? diff : 2 * 60 * 60 * 1000;
    })();
    const nextStart = slot.startAt;
    const nextEnd = new Date(nextStart.getTime() + durationMs);
    setDate(toDateInput(nextStart.toISOString()));
    setStartTime(toTimeInput(nextStart.toISOString()));
    setEndTime(toTimeInput(nextEnd.toISOString()));
    if (slot.assignedUserId && slot.assignedUserId !== "__unassigned__") {
      setAssignedUserIds((current) => [
        slot.assignedUserId!,
        ...current.filter((id) => id !== slot.assignedUserId),
      ]);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Schedule</h3>
      </div>

      {canEdit ? (
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Title</label>
            <Input
              value={visitTitle}
              onChange={(e) => setVisitTitle(e.target.value)}
              placeholder="Visit title"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Date</label>
            <button
              type="button"
              className="flex h-9 w-full items-center rounded-md border border-input bg-transparent px-3 text-left text-sm shadow-sm hover:bg-muted/40"
              onClick={() => setScheduleOpen(true)}
            >
              {date
                ? new Date(`${date}T12:00`).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "Choose date"}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Start</label>
              <button
                type="button"
                className="flex h-9 w-full items-center rounded-md border border-input bg-transparent px-3 text-left text-sm shadow-sm hover:bg-muted/40"
                onClick={() => setScheduleOpen(true)}
              >
                {formatTimeLabel(startTime)}
              </button>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">End</label>
              <button
                type="button"
                className="flex h-9 w-full items-center rounded-md border border-input bg-transparent px-3 text-left text-sm shadow-sm hover:bg-muted/40"
                onClick={() => setScheduleOpen(true)}
              >
                {formatTimeLabel(endTime)}
              </button>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Assigned technicians
            </label>
            <EmployeeMultiSelect
              values={assignedUserIds}
              employees={employeeOptions}
              onValuesChange={setAssignedUserIds}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              The first technician selected is the primary assignee.
            </p>
          </div>
          <Button type="submit" size="sm" className="w-full" disabled={saving}>
            {saving ? "Saving..." : status === "UNSCHEDULED" ? "Save to schedule" : "Save schedule"}
          </Button>
          {status === "UNSCHEDULED" ? (
            <p className="text-xs text-muted-foreground">
              This visit is not on the board yet. Click the date or time to check the full
              schedule, then save.
            </p>
          ) : null}
          <SchedulePeekModal
            open={scheduleOpen}
            date={date}
            onClose={() => setScheduleOpen(false)}
            onSelectSlot={applyScheduleSlot}
          />
        </form>
      ) : (
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Date</dt>
            <dd className="font-medium">{new Date(startAt).toLocaleDateString()}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Time</dt>
            <dd className="font-medium">
              {new Date(startAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              {" – "}
              {new Date(endAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Technicians</dt>
            <dd className="font-medium">
              {selectedEmployees.length ? (
                <span className="flex flex-col gap-2">
                  {selectedEmployees.map((employee) => (
                    <span key={employee.id} className="flex items-center gap-2">
                      <TechnicianAvatar employee={employee} />
                      {employee.name}
                    </span>
                  ))}
                </span>
              ) : (
                "Unassigned"
              )}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
