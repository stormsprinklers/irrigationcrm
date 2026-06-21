"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export type BookingCompanyInfo = {
  name: string;
  phone: string | null;
  supportEmail: string | null;
};

export type BookingSlot = {
  startAt: string;
  endAt: string;
};

type BookingFormProps = {
  slug?: string;
  apiBase?: string;
  company?: BookingCompanyInfo;
  initialSlots?: BookingSlot[];
  onSuccess?: (result: { visitId: string; startAt: string; endAt: string }) => void;
  submitLabel?: string;
  showHeader?: boolean;
};

type Step = "contact" | "address" | "slot" | "confirm";

export function BookingForm({
  slug,
  apiBase = slug ? `/api/book/public/${slug}` : "/api/schedule/jobs",
  company,
  initialSlots,
  onSuccess,
  submitLabel = "Book appointment",
  showHeader = true,
}: BookingFormProps) {
  const isPublic = Boolean(slug);
  const [step, setStep] = useState<Step>("contact");
  const [loading, setLoading] = useState(false);
  const [slots, setSlots] = useState<BookingSlot[]>(initialSlots ?? []);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<BookingSlot | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    title: "Service appointment",
    notes: "",
  });

  const loadSlots = useCallback(async () => {
    if (!isPublic || !slug) return;
    if (!form.zip || form.zip.length < 5) return;
    setSlotsLoading(true);
    try {
      const res = await fetch(`${apiBase}?zip=${encodeURIComponent(form.zip)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load slots");
      setSlots(data.slots ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load availability");
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, [apiBase, form.zip, isPublic, slug]);

  useEffect(() => {
    if (step === "slot" && isPublic) loadSlots();
  }, [step, isPublic, loadSlots]);

  async function handleSubmit() {
    if (!selectedSlot) return;
    setLoading(true);
    try {
      const payload = {
        ...form,
        startAt: selectedSlot.startAt,
        endAt: selectedSlot.endAt,
      };

      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Booking failed");

      setConfirmed(true);
      onSuccess?.(data);
      toast.success("Appointment booked!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Booking failed");
    } finally {
      setLoading(false);
    }
  }

  if (confirmed && selectedSlot) {
    return (
      <div className="rounded-lg border border-border bg-white p-6 text-center">
        <h2 className="text-xl font-semibold text-green-700">You&apos;re booked!</h2>
        <p className="mt-2 text-muted-foreground">
          {format(new Date(selectedSlot.startAt), "EEEE, MMMM d")} at{" "}
          {format(new Date(selectedSlot.startAt), "h:mm a")}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          We&apos;ll send a confirmation to {form.phone || form.email}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {showHeader && company && (
        <div>
          <h2 className="text-lg font-semibold">{company.name}</h2>
          {company.phone && (
            <p className="text-sm text-muted-foreground">{company.phone}</p>
          )}
        </div>
      )}

      <div className="flex gap-2 text-xs text-muted-foreground">
        {(["contact", "address", "slot"] as Step[]).map((s, i) => (
          <span
            key={s}
            className={step === s ? "font-medium text-foreground" : ""}
          >
            {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
          </span>
        ))}
      </div>

      {step === "contact" && (
        <div className="space-y-3">
          <div>
            <label className="text-sm text-muted-foreground">Name *</label>
            <Input
              className="mt-1"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Phone *</label>
            <Input
              className="mt-1"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Email</label>
            <Input
              className="mt-1"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <Button
            className="w-full"
            disabled={!form.name.trim() || !form.phone.trim()}
            onClick={() => setStep("address")}
          >
            Continue
          </Button>
        </div>
      )}

      {step === "address" && (
        <div className="space-y-3">
          <div>
            <label className="text-sm text-muted-foreground">Street address</label>
            <Input
              className="mt-1"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-muted-foreground">City</label>
              <Input
                className="mt-1"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">State</label>
              <Input
                className="mt-1"
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Zip code *</label>
            <Input
              className="mt-1 max-w-[140px]"
              value={form.zip}
              onChange={(e) => setForm({ ...form, zip: e.target.value })}
              placeholder="84057"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep("contact")}>
              Back
            </Button>
            <Button
              className="flex-1"
              disabled={form.zip.replace(/\D/g, "").length < 5}
              onClick={() => setStep("slot")}
            >
              Choose time
            </Button>
          </div>
        </div>
      )}

      {step === "slot" && (
        <div className="space-y-3">
          {slotsLoading ? (
            <p className="text-sm text-muted-foreground">Loading available times...</p>
          ) : slots.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No available times in the next two weeks. Try a different zip or contact the office.
            </p>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {slots.map((slot) => (
                <button
                  key={slot.startAt}
                  type="button"
                  onClick={() => setSelectedSlot(slot)}
                  className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    selectedSlot?.startAt === slot.startAt
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  {format(new Date(slot.startAt), "EEE, MMM d")} ·{" "}
                  {format(new Date(slot.startAt), "h:mm a")} –{" "}
                  {format(new Date(slot.endAt), "h:mm a")}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep("address")}>
              Back
            </Button>
            <Button
              className="flex-1"
              disabled={!selectedSlot || loading}
              onClick={handleSubmit}
            >
              {loading ? "Booking..." : submitLabel}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
