"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalPortal } from "@/components/ui/ModalPortal";

type Props = {
  open: boolean;
  defaultStart: Date;
  defaultEnd: Date;
  onClose: () => void;
};

export function HolidayScheduleExportDialog({ open, defaultStart, defaultEnd, onClose }: Props) {
  const [startDate, setStartDate] = useState(format(defaultStart, "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(defaultEnd, "yyyy-MM-dd"));
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStartDate(format(defaultStart, "yyyy-MM-dd"));
    setEndDate(format(defaultEnd, "yyyy-MM-dd"));
  }, [open, defaultStart, defaultEnd]);

  if (!open) return null;

  async function exportCsv() {
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    end.setDate(end.getDate() + 1);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      toast.error("Choose a valid date range");
      return;
    }
    setExporting(true);
    try {
      const query = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() });
      const response = await fetch(`/api/schedule/holiday-lighting-export?${query}`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Export failed");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `holiday-lighting-schedule-${startDate}-to-${endDate}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Schedule exported");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
        <button className="absolute inset-0 bg-black/50" aria-label="Close export" onClick={onClose} />
        <div className="relative w-full max-w-md rounded-lg border bg-background p-5 shadow-xl">
          <h2 className="text-lg font-semibold">Export holiday lighting schedule</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The CSV includes visit time, customer, technicians, address, strand color, footage, and light color or pattern.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">Start date
              <Input className="mt-1" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>
            <label className="text-sm font-medium">End date
              <Input className="mt-1" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={exporting}>Cancel</Button>
            <Button onClick={() => void exportCsv()} disabled={exporting}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Export CSV
            </Button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
