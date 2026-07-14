"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Slot = { startAt: string; endAt: string };

type BookingInfo = {
  company: { name: string; phone: string | null; timezone: string | null };
  applicant: { name: string; jobTitle: string };
  managerName: string;
  existingBooking: { startAt: string; endAt: string } | null;
  slots: Slot[];
  slotMinutes: number;
};

function formatSlot(iso: string, timeZone?: string | null) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timeZone?.trim() || "America/Denver",
  });
}

export function HiringBookingClient({ token }: { token: string }) {
  const [info, setInfo] = useState<BookingInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [confirmed, setConfirmed] = useState<{ startAt: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/book/hiring/${token}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Unable to load booking");
        setInfo(null);
        return;
      }
      setInfo(data);
      if (data.existingBooking) {
        setConfirmed({ startAt: data.existingBooking.startAt });
      }
    } catch {
      setError("Unable to load booking");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function bookSlot(startAt: string) {
    setBooking(true);
    setError(null);
    try {
      const res = await fetch(`/api/book/hiring/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startAt }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not book that time");
        await load();
        return;
      }
      setConfirmed({ startAt: data.booking.startAt });
    } catch {
      setError("Could not book that time");
    } finally {
      setBooking(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-600">Loading available times…</p>;
  }

  if (error && !info) {
    return <p className="text-sm text-red-700">{error}</p>;
  }

  if (!info) return null;

  if (confirmed) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-slate-900">You&apos;re booked</h1>
        <p className="text-slate-600">
          Your phone screen with {info.company.name} is scheduled for{" "}
          <strong>{formatSlot(confirmed.startAt, info.company.timezone)}</strong>.
        </p>
        <p className="text-sm text-slate-500">We&apos;ll call you at the number on your application.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-500">{info.company.name}</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Book a phone screen</h1>
        <p className="mt-2 text-slate-600">
          Hi {info.applicant.name.split(" ")[0]}. Pick a {info.slotMinutes}-minute time to talk about{" "}
          {info.applicant.jobTitle}.
        </p>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {!info.slots.length ? (
        <p className="text-sm text-slate-600">
          No times are open right now. Please check back soon or contact {info.company.name}.
        </p>
      ) : (
        <ul className="space-y-2">
          {info.slots.map((slot) => (
            <li key={slot.startAt}>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-between"
                disabled={booking}
                onClick={() => void bookSlot(slot.startAt)}
              >
                <span>{formatSlot(slot.startAt, info.company.timezone)}</span>
                <span className="text-xs text-muted-foreground">Book</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
