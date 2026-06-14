"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DEFAULT_BUSINESS_HOURS, type BusinessHoursDay } from "@/lib/company/types";

const dayKeys = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

export default function VoiceHoursPage() {
  const [hours, setHours] = useState<Record<string, BusinessHoursDay>>(DEFAULT_BUSINESS_HOURS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/voice")
      .then((r) => r.json())
      .then((data) => {
        if (data.businessHours && typeof data.businessHours === "object") {
          setHours({ ...DEFAULT_BUSINESS_HOURS, ...data.businessHours });
        }
      })
      .catch(() => toast.error("Failed to load hours"));
  }, []);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/settings/voice", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessHours: hours }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error("Failed to save");
      return;
    }
    toast.success("Business hours saved");
  }

  return (
    <ContentArea className="max-w-2xl">
      <PageHeader
        breadcrumb={["Settings", "Voice", "Business hours"]}
        title="Business hours"
        subtitle="Used for after-hours routing on inbound calls"
      />

      <div className="space-y-3 rounded-lg border border-border bg-white p-6">
        {dayKeys.map((day) => (
          <div key={day} className="flex flex-wrap items-center gap-3 text-sm">
            <span className="w-28 capitalize">{day}</span>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={hours[day]?.open ?? false}
                onCheckedChange={(c) =>
                  setHours({ ...hours, [day]: { ...hours[day], open: Boolean(c) } })
                }
              />
              Open
            </label>
            <input
              type="time"
              className="rounded border border-input px-2 py-1"
              value={hours[day]?.start ?? "09:00"}
              onChange={(e) =>
                setHours({ ...hours, [day]: { ...hours[day], start: e.target.value } })
              }
            />
            <span>to</span>
            <input
              type="time"
              className="rounded border border-input px-2 py-1"
              value={hours[day]?.end ?? "17:00"}
              onChange={(e) =>
                setHours({ ...hours, [day]: { ...hours[day], end: e.target.value } })
              }
            />
          </div>
        ))}
        <Button onClick={save} disabled={saving} className="mt-4">
          {saving ? "Saving..." : "Save hours"}
        </Button>
      </div>
    </ContentArea>
  );
}
