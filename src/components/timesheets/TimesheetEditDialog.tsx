"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalPortal } from "@/components/ui/ModalPortal";

export type TimesheetEntry = {
  id: string;
  userId: string;
  userName: string;
  clockInAt: string;
  clockOutAt: string | null;
  durationHours: number;
  inProgress: boolean;
};

function localDateTimeValue(iso: string | null) {
  return iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : "";
}

export function TimesheetEditDialog({
  entry,
  onClose,
  onSaved,
}: {
  entry: TimesheetEntry | null;
  onClose: () => void;
  onSaved: (entry: TimesheetEntry) => void;
}) {
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setClockIn(localDateTimeValue(entry?.clockInAt ?? null));
    setClockOut(localDateTimeValue(entry?.clockOutAt ?? null));
    setReason("");
  }, [entry]);

  if (!entry) return null;
  const activeEntry = entry;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!clockIn) {
      toast.error("Clock-in time is required");
      return;
    }
    if (!reason.trim()) {
      toast.error("Enter a reason for this correction");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/timesheets/${activeEntry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clockInAt: new Date(clockIn).toISOString(),
          clockOutAt: clockOut ? new Date(clockOut).toISOString() : null,
          reason: reason.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to correct timesheet entry");
      toast.success("Timesheet corrected");
      onSaved(data.entry);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to correct timesheet entry");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
        <button
          type="button"
          className="absolute inset-0 bg-black/50"
          aria-label="Close timesheet correction"
          disabled={saving}
          onClick={onClose}
        />
        <form
          onSubmit={(event) => void save(event)}
          className="relative z-10 w-full max-w-lg space-y-4 rounded-lg border border-border bg-white p-5 shadow-xl"
        >
          <div>
            <h2 className="text-lg font-semibold">Correct timesheet</h2>
            <p className="mt-1 text-sm text-muted-foreground">{activeEntry.userName}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="timesheet-clock-in">
                Clock in
              </label>
              <Input
                id="timesheet-clock-in"
                type="datetime-local"
                value={clockIn}
                onChange={(event) => setClockIn(event.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="timesheet-clock-out">
                Clock out
              </label>
              <Input
                id="timesheet-clock-out"
                type="datetime-local"
                value={clockOut}
                onChange={(event) => setClockOut(event.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Leave blank only if the employee is still clocked in.
              </p>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="timesheet-reason">
              Reason for correction
            </label>
            <textarea
              id="timesheet-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={500}
              required
              placeholder="Example: Employee forgot to clock out at 5:00 PM"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            The original times and correction reason are saved in the staff audit log.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? "Saving..." : "Save correction"}
            </Button>
          </div>
        </form>
      </div>
    </ModalPortal>
  );
}
