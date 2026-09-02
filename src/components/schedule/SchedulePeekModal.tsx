"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScheduleView } from "@/components/schedule/ScheduleView";
import type { ScheduleSlotClick } from "@/lib/schedule/quick-add";

export function SchedulePeekModal({
  open,
  date,
  onClose,
  onSelectSlot,
}: {
  open: boolean;
  date?: string;
  onClose: () => void;
  onSelectSlot?: (slot: ScheduleSlotClick) => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[150] flex flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="font-semibold">Schedule</h2>
          <p className="text-xs text-muted-foreground">
            Click a time slot to use it, or close when you are done checking for conflicts.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          <X className="mr-1.5 h-4 w-4" />
          Close
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <ScheduleView
          embedded
          initialDate={date}
          onSelectSlot={
            onSelectSlot
              ? (slot) => {
                  onSelectSlot(slot);
                  onClose();
                }
              : undefined
          }
        />
      </div>
    </div>
  );
}
