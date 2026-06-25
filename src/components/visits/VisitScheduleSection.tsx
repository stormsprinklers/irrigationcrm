"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { blobProxyUrl } from "@/lib/blob/urls";
import { validateScheduledVisitAssignment } from "@/lib/schedule/visit-assignment";
import type { VisitStatus } from "@prisma/client";

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

type EmployeeOption = {
  id: string;
  name: string;
  photoUrl?: string | null;
  color?: string | null;
};

type Props = {
  visitId: string;
  startAt: string;
  endAt: string;
  status: string;
  assignedUser: EmployeeOption | null;
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
  startAt,
  endAt,
  status,
  assignedUser,
  canEdit,
  onUpdated,
}: Props) {
  const [date, setDate] = useState(toDateInput(startAt));
  const [startTime, setStartTime] = useState(toTimeInput(startAt));
  const [endTime, setEndTime] = useState(toTimeInput(endAt));
  const [assignedUserId, setAssignedUserId] = useState(assignedUser?.id ?? "");
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDate(toDateInput(startAt));
    setStartTime(toTimeInput(startAt));
    setEndTime(toTimeInput(endAt));
    setAssignedUserId(assignedUser?.id ?? "");
  }, [startAt, endAt, assignedUser?.id]);

  useEffect(() => {
    if (!canEdit) return;
    fetch("/api/schedule/filters")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setEmployees(data?.employees ?? []))
      .catch(() => {});
  }, [canEdit]);

  const employeeOptions = useMemo(() => {
    const list = [...employees];
    if (assignedUser && !list.some((e) => e.id === assignedUser.id)) {
      list.unshift(assignedUser);
    }
    return list;
  }, [employees, assignedUser]);

  const selectedEmployee =
    employeeOptions.find((e) => e.id === assignedUserId) ?? assignedUser ?? null;

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

    const assignmentError = validateScheduledVisitAssignment(
      status as VisitStatus,
      assignedUserId || null
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
          startAt: nextStart.toISOString(),
          endAt: nextEnd.toISOString(),
          assignedUserId: assignedUserId || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to update schedule");
        return;
      }
      toast.success("Schedule updated");
      await onUpdated();
    } finally {
      setSaving(false);
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
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Date</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Start</label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">End</label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Assigned technician
            </label>
            <div className="flex items-center gap-2">
              {selectedEmployee ? <TechnicianAvatar employee={selectedEmployee} /> : null}
              <select
                value={assignedUserId}
                onChange={(e) => setAssignedUserId(e.target.value)}
                className={selectClassName}
                required
              >
                <option value="">Select technician</option>
                {employeeOptions.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Button type="submit" size="sm" className="w-full" disabled={saving}>
            {saving ? "Saving..." : "Save schedule"}
          </Button>
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
            <dt className="text-xs text-muted-foreground">Technician</dt>
            <dd className="font-medium">
              {assignedUser ? (
                <span className="flex items-center gap-2">
                  <TechnicianAvatar employee={assignedUser} />
                  {assignedUser.name}
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
