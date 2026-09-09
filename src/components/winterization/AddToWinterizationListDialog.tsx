"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { CustomerSearchPicker } from "@/components/customers/CustomerSearchPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { nativeSelectClassName } from "@/components/ui/native-select";
import type { CustomerDTO } from "@/lib/customers/types";
import { listWinterizationWeeks, type WinterizationWeek } from "@/lib/winterization/weeks";

type Props = {
  open: boolean;
  weeks: WinterizationWeek[];
  seasonTag: string;
  onClose: () => void;
  onAdded: () => void;
};

export function AddToWinterizationListDialog({
  open,
  weeks,
  seasonTag,
  onClose,
  onAdded,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [zip, setZip] = useState("");
  const [weekStart, setWeekStart] = useState("");
  const [zoneCount, setZoneCount] = useState("");
  const [schedulingNotes, setSchedulingNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setSaving(false);
    setCustomerId("");
    setCustomerName("");
    setName("");
    setPhone("");
    setEmail("");
    setAddress("");
    setCity("");
    setZip("");
    setWeekStart("");
    setZoneCount("");
    setSchedulingNotes("");
  }, [open]);

  function fillFromCustomer(customer: CustomerDTO) {
    setName(customer.name);
    setPhone(customer.phone ?? "");
    setEmail(customer.email ?? "");
    setAddress(customer.address ?? "");
    setCity(customer.city ?? "");
    setZip(customer.zip ?? "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId && !name.trim()) {
      toast.error("Select a customer or enter a name");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/winterization/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customerId || undefined,
          name: name.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          address: address.trim() || undefined,
          city: city.trim() || undefined,
          zip: zip.trim() || undefined,
          weekStart: weekStart || undefined,
          zoneCount: zoneCount.trim() ? Number(zoneCount) : undefined,
          schedulingNotes: schedulingNotes.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Could not add to list");
      }
      toast.success(`Added to the list · tagged ${seasonTag}`);
      onAdded();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add to list");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const weekOptions = weeks.length > 0 ? weeks : listWinterizationWeeks();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border bg-background shadow-lg">
        <div className="flex items-start justify-between border-b px-4 py-3">
          <div>
            <h2 className="font-semibold">Add to winterization list</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Anyone on this list is tagged <span className="font-medium">{seasonTag}</span> so
              winterization campaigns can exclude them.
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form className="space-y-3 p-4" onSubmit={(e) => void handleSubmit(e)}>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Existing customer</label>
            <div className="mt-1">
              <CustomerSearchPicker
                compact
                value={customerId}
                selectedName={customerName}
                onValueChange={(id, selected) => {
                  setCustomerId(id);
                  setCustomerName(selected);
                  if (!id) return;
                }}
                onCustomerSelect={fillFromCustomer}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <Input
              className="mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Required if you are not picking an existing customer"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Phone</label>
              <Input className="mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <Input
                className="mt-1"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Address</label>
            <Input className="mt-1" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">City</label>
              <Input className="mt-1" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">ZIP</label>
              <Input className="mt-1" value={zip} onChange={(e) => setZip(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Preferred week</label>
              <select
                className={`${nativeSelectClassName} mt-1`}
                value={weekStart}
                onChange={(e) => setWeekStart(e.target.value)}
              >
                <option value="">No week yet</option>
                {weekOptions.map((week) => (
                  <option key={week.id} value={week.startDate}>
                    {week.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Zones</label>
              <Input
                className="mt-1"
                inputMode="numeric"
                value={zoneCount}
                onChange={(e) => setZoneCount(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Notes</label>
            <textarea
              className="mt-1 min-h-[72px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={schedulingNotes}
              onChange={(e) => setSchedulingNotes(e.target.value)}
              placeholder="Already interested, called in, etc."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Add to list
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
