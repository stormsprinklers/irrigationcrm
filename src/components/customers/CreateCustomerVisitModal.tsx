"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CustomerDTO, CustomerPropertyDTO } from "@/lib/customers/types";

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function defaultVisitTimes() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return { date: date.toISOString().slice(0, 10), startTime: "09:00", endTime: "11:00" };
}

type Props = {
  open: boolean;
  onClose: () => void;
  customer: CustomerDTO;
  properties: CustomerPropertyDTO[];
};

export function CreateCustomerVisitModal({ open, onClose, customer, properties }: Props) {
  const router = useRouter();
  const defaults = defaultVisitTimes();
  const [saving, setSaving] = useState(false);
  const [filterOptions, setFilterOptions] = useState<{
    serviceAreas: { id: string; name: string }[];
    employees: { id: string; name: string }[];
  }>({ serviceAreas: [], employees: [] });
  const primaryProperty = properties.find((p) => p.isPrimary) ?? properties[0];
  const [form, setForm] = useState({
    title: "",
    division: "SERVICE" as "SERVICE" | "INSTALL",
    date: defaults.date,
    startTime: defaults.startTime,
    endTime: defaults.endTime,
    serviceAreaId: "",
    assignedUserId: "",
    propertyId: primaryProperty?.id ?? "",
    zip: primaryProperty?.zip ?? customer.zip ?? "",
  });

  useEffect(() => {
    if (!open) return;
    fetch("/api/schedule/filters")
      .then((r) => r.json())
      .then((data) => {
        setFilterOptions({
          serviceAreas: data.serviceAreas ?? [],
          employees: data.employees ?? [],
        });
        if (data.serviceAreas?.[0]?.id) {
          setForm((f) => ({ ...f, serviceAreaId: f.serviceAreaId || data.serviceAreas[0].id }));
        }
      })
      .catch(() => toast.error("Failed to load schedule options"));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prop = properties.find((p) => p.isPrimary) ?? properties[0];
    if (prop) {
      setForm((f) => ({
        ...f,
        propertyId: prop.id,
        zip: prop.zip ?? customer.zip ?? f.zip,
      }));
    }
  }, [open, properties, customer.zip]);

  if (!open) return null;

  if (customer.doNotService) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
        <div className="relative z-10 w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
          <h2 className="text-lg font-semibold text-destructive">Do not service</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {customer.name} is marked DO NOT SERVICE. Appointments cannot be booked until that flag
            is cleared by a manager.
          </p>
          <Button type="button" className="mt-4" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!form.serviceAreaId && !form.zip.trim()) {
      toast.error("Select a service area or enter a zip code");
      return;
    }

    const startAt = new Date(`${form.date}T${form.startTime}`);
    const endAt = new Date(`${form.date}T${form.endTime}`);
    if (endAt <= startAt) {
      toast.error("End time must be after start time");
      return;
    }

    const property = properties.find((p) => p.id === form.propertyId);

    setSaving(true);
    try {
      const res = await fetch("/api/schedule/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          division: form.division,
          serviceAreaId: form.serviceAreaId || undefined,
          assignedUserId: form.assignedUserId || undefined,
          customerId: customer.id,
          propertyId: property?.id || undefined,
          zip: form.zip.trim() || property?.zip || customer.zip || undefined,
          address: property?.address || customer.address || undefined,
          city: property?.city || customer.city || undefined,
          state: property?.state || customer.state || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to create visit");
        return;
      }
      const visit = await res.json();
      onClose();
      router.push(`/visits/${visit.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-lg border bg-background shadow-lg">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold">Add visit for {customer.name}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <form onSubmit={submit} className="grid gap-3 p-4">
          <Input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Visit title"
            required
            autoFocus
          />
          <select
            value={form.division}
            onChange={(e) => setForm({ ...form, division: e.target.value as "SERVICE" | "INSTALL" })}
            className={selectClassName}
          >
            <option value="SERVICE">Service</option>
            <option value="INSTALL">Install</option>
          </select>
          <Input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="time"
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
              required
            />
            <Input
              type="time"
              value={form.endTime}
              onChange={(e) => setForm({ ...form, endTime: e.target.value })}
              required
            />
          </div>
          <select
            value={form.serviceAreaId}
            onChange={(e) => setForm({ ...form, serviceAreaId: e.target.value })}
            className={selectClassName}
          >
            <option value="">Service area</option>
            {filterOptions.serviceAreas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </select>
          {properties.length > 0 && (
            <select
              value={form.propertyId}
              onChange={(e) => {
                const prop = properties.find((p) => p.id === e.target.value);
                setForm({
                  ...form,
                  propertyId: e.target.value,
                  zip: prop?.zip ?? form.zip,
                });
              }}
              className={selectClassName}
            >
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                  {property.address ? ` — ${property.address}` : ""}
                </option>
              ))}
            </select>
          )}
          <select
            value={form.assignedUserId}
            onChange={(e) => setForm({ ...form, assignedUserId: e.target.value })}
            className={selectClassName}
          >
            <option value="">Assign to (optional)</option>
            {filterOptions.employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
          <Input
            value={form.zip}
            onChange={(e) => setForm({ ...form, zip: e.target.value })}
            placeholder="Zip (if no service area)"
          />
          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={saving}>
              {saving ? "Creating..." : "Create visit"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
