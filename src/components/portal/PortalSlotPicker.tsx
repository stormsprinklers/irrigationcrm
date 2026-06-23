"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";

type Slot = { startAt: string; endAt: string };

type Props = {
  selected: Slot | null;
  onSelect: (slot: Slot) => void;
};

export function PortalSlotPicker({ selected, onSelect }: Props) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/portal/slots")
      .then((r) => r.json())
      .then((data) => setSlots(data.slots ?? []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-muted-foreground">Loading available times...</p>;
  if (!slots.length) return <p className="text-sm text-muted-foreground">No available time slots.</p>;

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {slots.slice(0, 24).map((slot) => {
        const active = selected?.startAt === slot.startAt;
        return (
          <Button
            key={slot.startAt}
            type="button"
            variant={active ? "default" : "outline"}
            className="justify-start text-left h-auto py-2"
            onClick={() => onSelect(slot)}
          >
            {format(new Date(slot.startAt), "EEE MMM d")} · {format(new Date(slot.startAt), "h:mm a")}
          </Button>
        );
      })}
    </div>
  );
}
