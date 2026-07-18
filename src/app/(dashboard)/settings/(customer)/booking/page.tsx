"use client";

import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useCompanySettings } from "@/components/settings/useCompanySettings";
import {
  DEFAULT_DIVISION_BOOKING_WINDOWS,
  dedupeNonOverlapping,
  parseDivisionBookingWindows,
  type BookingWindow,
  type DivisionBookingWindows,
} from "@/lib/schedule/open-time-slots";

function WindowsEditor({
  label,
  description,
  windows,
  onChange,
}: {
  label: string;
  description: string;
  windows: BookingWindow[];
  onChange: (windows: BookingWindow[]) => void;
}) {
  function updateWindow(index: number, patch: Partial<BookingWindow>) {
    onChange(
      windows.map((window, i) => (i === index ? { ...window, ...patch } : window))
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-2">
        {windows.map((window, index) => (
          <div key={`${window.start}-${window.end}-${index}`} className="flex flex-wrap items-center gap-2">
            <Input
              type="time"
              className="w-[140px]"
              value={window.start}
              onChange={(e) => updateWindow(index, { start: e.target.value })}
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="time"
              className="w-[140px]"
              value={window.end}
              onChange={(e) => updateWindow(index, { end: e.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(windows.filter((_, i) => i !== index))}
            >
              Remove
            </Button>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...windows, { start: "08:00", end: "12:00" }])}
      >
        Add window
      </Button>
    </div>
  );
}

export default function SettingsBookingPage() {
  const { company, setCompany, loading, saving, save } = useCompanySettings();

  if (loading || !company) {
    return (
      <ContentArea className="max-w-2xl">
        <PageHeader breadcrumb={["Settings", "Booking"]} title="Booking" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </ContentArea>
    );
  }

  const publicUrl = company.bookingSlug
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/book/${company.bookingSlug}`
    : "Set a slug to generate URL";

  const divisionWindows = parseDivisionBookingWindows(company.divisionBookingWindows);

  function setDivisionWindows(next: DivisionBookingWindows) {
    setCompany({
      ...company!,
      divisionBookingWindows: {
        SERVICE: dedupeNonOverlapping(next.SERVICE),
        INSTALL: dedupeNonOverlapping(next.INSTALL),
      },
    });
  }

  return (
    <ContentArea className="max-w-2xl">
      <PageHeader
        breadcrumb={["Settings", "Booking"]}
        title="Online booking"
        actions={
          <Button size="sm" onClick={() => save(company)} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        }
      />
      <div className="space-y-4 rounded-lg border border-border bg-white p-6">
        <label className="flex items-center gap-3 text-sm">
          <Checkbox
            checked={company.onlineBookingEnabled}
            onCheckedChange={(checked) =>
              setCompany({ ...company, onlineBookingEnabled: Boolean(checked) })
            }
          />
          Enable online booking
        </label>
        <div>
          <label className="text-sm text-muted-foreground">Booking page slug</label>
          <Input
            className="mt-1"
            value={company.bookingSlug ?? ""}
            onChange={(e) => setCompany({ ...company, bookingSlug: e.target.value })}
            placeholder="storm-sprinklers"
          />
        </div>
        <div>
          <label className="text-sm text-muted-foreground">Lead time (hours)</label>
          <Input
            type="number"
            className="mt-1 max-w-[120px]"
            value={company.bookingLeadTimeHours}
            onChange={(e) =>
              setCompany({ ...company, bookingLeadTimeHours: Number(e.target.value) })
            }
          />
        </div>
        <p className="text-sm text-muted-foreground">Public URL: {publicUrl}</p>
      </div>

      <div className="mt-6 space-y-4 rounded-lg border border-border bg-white p-6">
        <div>
          <h3 className="font-semibold">Open Time Slots</h3>
          <p className="text-sm text-muted-foreground">
            Dashed boxes on the schedule Day view from each person&apos;s work hours intersected
            with these division booking windows.
          </p>
        </div>
        <label className="flex items-center gap-3 text-sm">
          <Checkbox
            checked={company.openTimeSlotsEnabled !== false}
            onCheckedChange={(checked) =>
              setCompany({ ...company, openTimeSlotsEnabled: Boolean(checked) })
            }
          />
          Show Open Time Slots on schedule
        </label>
        <WindowsEditor
          label="Service"
          description="Default: 8–11, 11–2, 2–5"
          windows={divisionWindows.SERVICE}
          onChange={(SERVICE) => setDivisionWindows({ ...divisionWindows, SERVICE })}
        />
        <WindowsEditor
          label="Install"
          description="Default: full day 8–4"
          windows={divisionWindows.INSTALL}
          onChange={(INSTALL) => setDivisionWindows({ ...divisionWindows, INSTALL })}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setCompany({
              ...company,
              divisionBookingWindows: structuredClone(DEFAULT_DIVISION_BOOKING_WINDOWS),
            })
          }
        >
          Reset to defaults
        </Button>
      </div>
    </ContentArea>
  );
}
