"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CustomerSearchPicker } from "@/components/customers/CustomerSearchPicker";
import { EmployeeSearchPicker } from "@/components/schedule/EmployeeSearchPicker";
import type { CustomerDTO } from "@/lib/customers/types";
import type { ScheduleSlotClick } from "@/lib/schedule/quick-add";

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

type Props = {
  open: boolean;
  slot: ScheduleSlotClick | null;
  serviceAreas: { id: string; name: string }[];
  employees: { id: string; name: string }[];
  onClose: () => void;
  onCreated: (visitId: string) => void;
};

export function ScheduleQuickAddDialog({
  open,
  slot,
  serviceAreas,
  employees,
  onClose,
  onCreated,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("Service visit");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDTO | null>(null);
  const [assignedUserId, setAssignedUserId] = useState("");
  const [assignedUserName, setAssignedUserName] = useState("");
  const [serviceAreaId, setServiceAreaId] = useState("");
  const [division, setDivision] = useState<"SERVICE" | "INSTALL">("SERVICE");

  useEffect(() => {
    if (!open) return;

    setTitle("Service visit");
    setCustomerId("");
    setCustomerName("");
    setSelectedCustomer(null);
    setServiceAreaId(serviceAreas[0]?.id ?? "");
    setDivision("SERVICE");

    const preassignedId =
      slot?.assignedUserId && slot.assignedUserId !== "__unassigned__" ? slot.assignedUserId : "";
    const preassignedEmployee = employees.find((employee) => employee.id === preassignedId);
    setAssignedUserId(preassignedId);
    setAssignedUserName(preassignedEmployee?.name ?? "");
  }, [open, slot, serviceAreas, employees]);

  if (!open || !slot) return null;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!slot) return;
    if (!customerId) {
      toast.error("Select a customer");
      return;
    }
    if (!assignedUserId) {
      toast.error("Assign a technician");
      return;
    }
    if (selectedCustomer?.doNotService) {
      toast.error("This customer is marked DO NOT SERVICE");
      return;
    }
    if (!serviceAreaId && !selectedCustomer?.zip) {
      toast.error("Select a service area or use a customer with a zip code");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/schedule/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || "Service visit",
          startAt: slot.startAt.toISOString(),
          endAt: slot.endAt.toISOString(),
          division,
          serviceAreaId: serviceAreaId || undefined,
          assignedUserId,
          customerId,
          zip: selectedCustomer?.zip || undefined,
          address: selectedCustomer?.address || undefined,
          city: selectedCustomer?.city || undefined,
          state: selectedCustomer?.state || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to create visit");
        return;
      }
      toast.success("Visit scheduled");
      onCreated(data.id);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-lg border bg-background shadow-lg">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="font-semibold">Schedule visit</h2>
            <p className="text-xs text-muted-foreground">
              {format(slot.startAt, "EEE, MMM d")} · {format(slot.startAt, "h:mm a")} –{" "}
              {format(slot.endAt, "h:mm a")} (3h arrival window)
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form className="space-y-3 p-4" onSubmit={(e) => void handleCreate(e)}>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Title</label>
            <Input
              className="mt-1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Service visit"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Customer</label>
            <div className="mt-1">
              <CustomerSearchPicker
                value={customerId}
                selectedName={customerName}
                onValueChange={(id, name) => {
                  setCustomerId(id);
                  setCustomerName(name);
                  if (!id) setSelectedCustomer(null);
                }}
                onCustomerSelect={setSelectedCustomer}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Technician</label>
            <div className="mt-1">
              <EmployeeSearchPicker
                value={assignedUserId}
                selectedName={assignedUserName}
                employees={employees}
                onValueChange={(id, name) => {
                  setAssignedUserId(id);
                  setAssignedUserName(name);
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Division</label>
              <select
                className={`${selectClassName} mt-1`}
                value={division}
                onChange={(e) => setDivision(e.target.value as "SERVICE" | "INSTALL")}
              >
                <option value="SERVICE">Service</option>
                <option value="INSTALL">Install</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Service area</label>
              <select
                className={`${selectClassName} mt-1`}
                value={serviceAreaId}
                onChange={(e) => setServiceAreaId(e.target.value)}
              >
                <option value="">From customer zip</option>
                {serviceAreas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Create visit
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
