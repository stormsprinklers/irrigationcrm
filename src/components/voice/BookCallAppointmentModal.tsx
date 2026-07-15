"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useVoiceDevice } from "@/contexts/VoiceDeviceProvider";

type FilterOptions = {
  serviceAreas: { id: string; name: string }[];
  employees: { id: string; name: string }[];
};

function defaultVisitTimes() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return { date: date.toISOString().slice(0, 10), startTime: "09:00", endTime: "11:00" };
}

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm";

export function BookCallAppointmentModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { activeCall, notifyVisitBooked } = useVoiceDevice();
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    serviceAreas: [],
    employees: [],
  });
  const [saving, setSaving] = useState(false);
  const times = defaultVisitTimes();
  const [visitForm, setVisitForm] = useState({
    title: "Service call",
    division: "SERVICE" as "SERVICE" | "INSTALL",
    date: times.date,
    startTime: times.startTime,
    endTime: times.endTime,
    serviceAreaId: "",
    assignedUserId: "",
  });

  useEffect(() => {
    if (!open) return;
    fetch("/api/schedule/filters")
      .then((r) => r.json())
      .then((data) => {
        setFilterOptions({
          serviceAreas: data.serviceAreas ?? [],
          employees: data.employees ?? [],
        });
        if (data.serviceAreas?.[0]?.id) {
          setVisitForm((v) => ({
            ...v,
            serviceAreaId: v.serviceAreaId || data.serviceAreas[0].id,
          }));
        }
      })
      .catch(() => toast.error("Failed to load schedule options"));
  }, [open]);

  if (!open) return null;

  async function submitVisit(e: React.FormEvent) {
    e.preventDefault();
    if (!visitForm.serviceAreaId) {
      toast.error("Service area required");
      return;
    }
    if (!visitForm.assignedUserId) {
      toast.error("Assign a technician before scheduling this visit");
      return;
    }
    setSaving(true);
    const startAt = new Date(`${visitForm.date}T${visitForm.startTime}`);
    const endAt = new Date(`${visitForm.date}T${visitForm.endTime}`);
    try {
      const res = await fetch("/api/schedule/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: visitForm.title,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          division: visitForm.division,
          serviceAreaId: visitForm.serviceAreaId,
          assignedUserId: visitForm.assignedUserId || null,
          customerId: activeCall?.callerInfo?.customerId || null,
          callSessionId: activeCall?.sessionId ?? null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to book");
      }
      const visit = await res.json();
      toast.success("Appointment booked");
      notifyVisitBooked(visit.id);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to book");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold">Book appointment</h2>
        <p className="text-sm text-muted-foreground">
          {activeCall?.callerInfo?.name
            ? `For ${activeCall.callerInfo.name}`
            : "New visit from this call"}
        </p>
        <form onSubmit={(e) => void submitVisit(e)} className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Title</label>
            <Input
              value={visitForm.title}
              onChange={(e) => setVisitForm({ ...visitForm, title: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Date</label>
              <Input
                type="date"
                value={visitForm.date}
                onChange={(e) => setVisitForm({ ...visitForm, date: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Division</label>
              <select
                className={selectClass}
                value={visitForm.division}
                onChange={(e) =>
                  setVisitForm({
                    ...visitForm,
                    division: e.target.value as "SERVICE" | "INSTALL",
                  })
                }
              >
                <option value="SERVICE">Service</option>
                <option value="INSTALL">Install</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Start</label>
              <Input
                type="time"
                value={visitForm.startTime}
                onChange={(e) => setVisitForm({ ...visitForm, startTime: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">End</label>
              <Input
                type="time"
                value={visitForm.endTime}
                onChange={(e) => setVisitForm({ ...visitForm, endTime: e.target.value })}
                required
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Service area</label>
            <select
              className={selectClass}
              value={visitForm.serviceAreaId}
              onChange={(e) => setVisitForm({ ...visitForm, serviceAreaId: e.target.value })}
              required
            >
              <option value="">Select…</option>
              {filterOptions.serviceAreas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Technician</label>
            <select
              className={selectClass}
              value={visitForm.assignedUserId}
              onChange={(e) => setVisitForm({ ...visitForm, assignedUserId: e.target.value })}
              required
            >
              <option value="">Select…</option>
              {filterOptions.employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Booking…" : "Book"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
