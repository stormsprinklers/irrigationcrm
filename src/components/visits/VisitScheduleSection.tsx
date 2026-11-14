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
  const d = new Date(iso);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toTimeInput(iso: string) {
  const d = new Date(iso);
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
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
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const persistedAssigneeIds = assignedUsers.length
    ? assignedUsers.map((employee) => employee.id)
    : assignedUser
      ? [assignedUser.id]
      : [];
  const persistedAssigneeKey = persistedAssigneeIds.join("|");

  useEffect(() => {
    setVisitTitle(title);
  }, [title]);

  useEffect(() => {
    setDate(toDateInput(startAt));
    setStartTime(toTimeInput(startAt));
    setEndTime(toTimeInput(endAt));
  }, [startAt, endAt]);

  useEffect(() => {
    setAssignedUserIds(persistedAssigneeKey ? persistedAssigneeKey.split("|") : []);
  }, [persistedAssigneeKey]);

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

  function setStartAndDefaultEnd(nextDate: string, nextStartTime: string) {
    setDate(nextDate);
    setStartTime(nextStartTime);
    const nextStart = new Date(`${nextDate}T${nextStartTime}`);
    if (Number.isNaN(nextStart.getTime())) return;
    const nextEnd = new Date(nextStart.getTime() + 2 * 60 * 60 * 1000);
    setEndTime(toTimeInput(nextEnd.toISOString()));
  }

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
    if (nextStart.getMinutes() % 15 !== 0 || nextEnd.getMinutes() % 15 !== 0) {
      toast.error("Visit times must use 15-minute increments");
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
      const scheduleChanged =
        date !== toDateInput(startAt) ||
        startTime !== toTimeInput(startAt) ||
        endTime !== toTimeInput(endAt);
      const res = await fetch(`/api/visits/${visitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(visitTitle.trim() !== title ? { title: visitTitle.trim() } : {}),
          ...(scheduleChanged
            ? { startAt: nextStart.toISOString(), endAt: nextEnd.toISOString() }
            : {}),
          assignedUserIds,
          ...(status === "UNSCHEDULED" ? { status: "SCHEDULED" } : {}),
          notifyCustomer,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to update schedule");
        return;
      }
      if (data.warning) toast.warning(data.warning);
      toast.success("Schedule updated");
      setNotifyCustomer(true);
      await onUpdated();
    } finally {
      setSaving(false);
    }
  }

  function applyScheduleSlot(slot: ScheduleSlotClick) {
    const nextStart = slot.startAt;
    const nextEnd = new Date(nextStart.getTime() + 2 * 60 * 60 * 1000);
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
            <Input
              type="date"
              value={date}
              onChange={(event) => setStartAndDefaultEnd(event.target.value, startTime)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Start</label>
              <Input
                type="time"
                step={900}
                value={startTime}
                onChange={(event) => setStartAndDefaultEnd(date, event.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">End</label>
              <Input
                type="time"
                step={900}
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
              />
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setScheduleOpen(true)}
          >
            <CalendarClock className="mr-1.5 h-4 w-4" />
            View schedule and choose a time
          </Button>
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
          <label className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={notifyCustomer}
              onChange={(event) => setNotifyCustomer(event.target.checked)}
            />
            <span>
              <span className="block font-medium">Notify customer</span>
              <span className="block text-xs text-muted-foreground">
                Send an appointment notification if the visit is newly scheduled or its time changes.
              </span>
            </span>
          </label>
          <Button type="submit" size="sm" className="w-full" disabled={saving}>
            {saving ? "Saving..." : status === "UNSCHEDULED" ? "Save to schedule" : "Save schedule"}
          </Button>
          {status === "UNSCHEDULED" ? (
            <p className="text-xs text-muted-foreground">
              This visit is not on the board yet. Enter a date and time directly or choose an
              opening from the full schedule, then save.
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
