"use client";

import { useEffect, useState } from "react";
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
import { toast } from "sonner";

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

  const publicOrigin = (company.customerBaseUrl || company.appBaseUrl || "").replace(/\/$/, "");
  const radarBookingUrl = company.bookingSlug
    ? publicOrigin
      ? `${publicOrigin}/book/${company.bookingSlug}`
      : `/book/${company.bookingSlug}`
    : "Set a slug to generate a Radar booking URL";
  const customerFacingUrl =
    company.websiteBookingUrl?.trim() ||
    (company.bookingSlug && publicOrigin ? `${publicOrigin}/book/${company.bookingSlug}` : null);

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
        <div>
          <h3 className="font-semibold">Website booking</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Storm&apos;s live site already has a full booker: zip code, then service (repair,
            seasonal, or install), then Housecall Pro availability, then contact and address. That
            creates a Housecall Pro job. Winterization is a separate week request — no day or time
            slot. Radar is not connected to that flow; these URLs are only used in SMS, email, and
            campaigns while you finish Radar.
          </p>
        </div>
        <div>
          <label className="text-sm text-muted-foreground">Online booking URL</label>
          <Input
            className="mt-1"
            value={company.websiteBookingUrl ?? ""}
            onChange={(e) => setCompany({ ...company, websiteBookingUrl: e.target.value })}
            placeholder="https://www.stormsprinklers.com/booking"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Used for <code className="text-xs">{`{booking_link}`}</code> in notifications and
            campaigns (unless a campaign override is set).
          </p>
        </div>
        <div>
          <label className="text-sm text-muted-foreground">Winterization booking URL (optional)</label>
          <Input
            className="mt-1"
            value={company.websiteWinterizationBookingUrl ?? ""}
            onChange={(e) =>
              setCompany({ ...company, websiteWinterizationBookingUrl: e.target.value })
            }
            placeholder="https://www.stormsprinklers.com/book-winterization"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Available as a campaign link for winterization week requests. Lead acknowledgements for
            winterization still do not include a booking link.
          </p>
        </div>
        {customerFacingUrl ? (
          <p className="text-sm text-muted-foreground">Customer-facing booking link: {customerFacingUrl}</p>
        ) : null}
      </div>

      <div className="mt-6 space-y-4 rounded-lg border border-border bg-white p-6">
        <div>
          <h3 className="font-semibold">Radar booking</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Radar&apos;s own public booker (/book/slug on this company&apos;s customer domain). It is
            not on the Storm website and does not create Housecall Pro jobs. When you switch off
            Housecall Pro, customers can use this page instead of the website URL above.
          </p>
        </div>
        <label className="flex items-center gap-3 text-sm">
          <Checkbox
            checked={company.onlineBookingEnabled}
            onCheckedChange={(checked) =>
              setCompany({ ...company, onlineBookingEnabled: Boolean(checked) })
            }
          />
          Enable Radar online booking
        </label>
        <label className="flex items-start gap-3 text-sm">
          <Checkbox
            checked={Boolean(company.onlineBookingVirtualOnly)}
            onCheckedChange={(checked) =>
              setCompany({ ...company, onlineBookingVirtualOnly: Boolean(checked) })
            }
          />
          <span>
            Virtual appointments only
            <span className="mt-0.5 block text-xs text-muted-foreground">
              30-minute Google Meet consults. Use this for Chestnut &amp; Cheer (or any company
              that should not book on-site jobs from Radar).
            </span>
          </span>
        </label>
        <div>
          <label className="text-sm text-muted-foreground">Booking page slug</label>
          <Input
            className="mt-1"
            value={company.bookingSlug ?? ""}
            onChange={(e) => setCompany({ ...company, bookingSlug: e.target.value })}
            placeholder="storm-sprinklers"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Radar URL uses this company&apos;s customer domain (Settings → Customer portal).
          </p>
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
        <div>
          <label className="text-sm text-muted-foreground">On-site slot length (minutes)</label>
          <Input
            type="number"
            min={15}
            max={480}
            className="mt-1 max-w-[120px]"
            value={company.onlineBookingSlotMinutes ?? 120}
            onChange={(e) =>
              setCompany({ ...company, onlineBookingSlotMinutes: Number(e.target.value) })
            }
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Storm&apos;s website books 180-minute Housecall Pro jobs (45 minutes for
            winterization). Set Radar to 180 when you want on-site visits to match that window.
            Virtual consults stay 30 minutes.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">Radar public URL: {radarBookingUrl}</p>
      </div>

      <BookingPeopleAndMeet />

      <div className="mt-6 space-y-4 rounded-lg border border-border bg-white p-6">
        <div>
          <h3 className="font-semibold">Open Time Slots</h3>
          <p className="text-sm text-muted-foreground">
            Dashed boxes on the schedule Day view from each person&apos;s work hours intersected
            with these division booking windows.
          </p>
        </div>
        <div>
          <label className="text-sm font-medium">Default arrival window (hours)</label>
          <Input
            type="number"
            min={1}
            max={12}
            step={1}
            className="mt-1 max-w-[120px]"
            value={company.arrivalWindowHours}
            onChange={(e) =>
              setCompany({ ...company, arrivalWindowHours: Number(e.target.value) })
            }
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Used when an employee clicks the schedule to add a visit and in appointment
            notifications. Existing visits keep their current start and end times.
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

type BookingStaff = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  onlineBookingEnabled: boolean;
};

function BookingPeopleAndMeet() {
  const [staff, setStaff] = useState<BookingStaff[]>([]);
  const [savingStaff, setSavingStaff] = useState(false);
  const [calendar, setCalendar] = useState<{
    configured: boolean;
    connected: boolean;
    email: string | null;
  } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    fetch("/api/settings/booking/staff")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.staff) setStaff(data.staff);
      })
      .catch(() => {});
    fetch("/api/settings/booking/google-calendar/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setCalendar(data);
      })
      .catch(() => {});

    const params = new URLSearchParams(window.location.search);
    if (params.get("calendar") === "connected") {
      toast.success("Google Calendar connected");
    }
    const error = params.get("error");
    if (error) toast.error(decodeURIComponent(error));
  }, []);

  async function saveStaff() {
    setSavingStaff(true);
    try {
      const res = await fetch("/api/settings/booking/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabledUserIds: staff.filter((person) => person.onlineBookingEnabled).map((person) => person.id),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setStaff(data.staff ?? staff);
      toast.success("Bookable people saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingStaff(false);
    }
  }

  async function disconnectCalendar() {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/settings/booking/google-calendar", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to disconnect");
      setCalendar((prev) => (prev ? { ...prev, connected: false, email: null } : prev));
      toast.success("Google Calendar disconnected");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to disconnect");
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <>
      <div className="mt-6 space-y-4 rounded-lg border border-border bg-white p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">Who can take online bookings</h3>
            <p className="text-sm text-muted-foreground">
              Only checked people appear on Radar&apos;s public calendar — not the marketing
              website, which still books through Housecall Pro. Slots use their work hours and skip
              times they already have assigned visits or approved time off.
            </p>
          </div>
          <Button size="sm" onClick={saveStaff} disabled={savingStaff}>
            {savingStaff ? "Saving..." : "Save people"}
          </Button>
        </div>
        {staff.length === 0 ? (
          <p className="text-sm text-muted-foreground">No employees found.</p>
        ) : (
          <div className="space-y-2">
            {staff.map((person) => (
              <label key={person.id} className="flex items-center gap-3 text-sm">
                <Checkbox
                  checked={person.onlineBookingEnabled}
                  disabled={person.status !== "ACTIVE"}
                  onCheckedChange={(checked) =>
                    setStaff((prev) =>
                      prev.map((row) =>
                        row.id === person.id
                          ? { ...row, onlineBookingEnabled: Boolean(checked) }
                          : row
                      )
                    )
                  }
                />
                <span>
                  {person.name}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {person.email}
                    {person.status !== "ACTIVE" ? " · archived" : ""}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 space-y-4 rounded-lg border border-border bg-white p-6">
        <div>
          <h3 className="font-semibold">Google Meet</h3>
          <p className="text-sm text-muted-foreground">
            Connect the company Google Calendar. Virtual bookings create a Meet event and email
            the customer (and assigned person) automatically.
          </p>
        </div>
        {calendar?.connected ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm">
              Connected{calendar.email ? ` as ${calendar.email}` : ""}.
            </p>
            <Button type="button" variant="outline" size="sm" asChild>
              <a href="/api/settings/booking/google-calendar">Reconnect</a>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disconnecting}
              onClick={disconnectCalendar}
            >
              Disconnect
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {calendar && !calendar.configured ? (
              <p className="text-sm text-muted-foreground">
                Add GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET, then add this
                redirect URI in Google Cloud:{" "}
                <code className="text-xs">
                  /api/settings/booking/google-calendar/callback
                </code>
              </p>
            ) : null}
            <Button type="button" size="sm" asChild>
              <a href="/api/settings/booking/google-calendar">Connect Google Calendar</a>
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
