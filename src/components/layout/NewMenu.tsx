"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, ChevronDown, FileText, Plus, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { CustomerDTO, CustomerPropertyDTO } from "@/lib/customers/types";

type CreateKind = "customer" | "visit" | "estimate";

type FilterOptions = {
  serviceAreas: { id: string; name: string }[];
  employees: { id: string; name: string }[];
};

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function CreateModal({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;

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
          <h2 className="font-semibold">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function defaultVisitTimes() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const dateStr = date.toISOString().slice(0, 10);
  return { date: dateStr, startTime: "09:00", endTime: "11:00" };
}

export function NewMenu() {
  const router = useRouter();
  const [createKind, setCreateKind] = useState<CreateKind | null>(null);
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<CustomerDTO[]>([]);
  const [properties, setProperties] = useState<CustomerPropertyDTO[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    serviceAreas: [],
    employees: [],
  });

  const [newCustomer, setNewCustomer] = useState({
    name: "",
    email: "",
    phone: "",
    companyName: "",
  });

  const defaultTimes = defaultVisitTimes();
  const [newVisit, setNewVisit] = useState({
    title: "",
    division: "SERVICE" as "SERVICE" | "INSTALL",
    date: defaultTimes.date,
    startTime: defaultTimes.startTime,
    endTime: defaultTimes.endTime,
    serviceAreaId: "",
    assignedUserId: "",
    customerId: "",
    zip: "",
  });

  const [newEstimate, setNewEstimate] = useState({
    customerId: "",
    propertyId: "",
  });

  useEffect(() => {
    if (!createKind || createKind === "customer") return;

    fetch("/api/customers")
      .then((r) => r.json())
      .then((data) => setCustomers(data.customers ?? []))
      .catch(() => toast.error("Failed to load customers"));

    if (createKind === "visit") {
      fetch("/api/schedule/filters")
        .then((r) => r.json())
        .then((data) => {
          setFilterOptions({
            serviceAreas: data.serviceAreas ?? [],
            employees: data.employees ?? [],
          });
          if (data.serviceAreas?.[0]?.id) {
            setNewVisit((v) => ({ ...v, serviceAreaId: v.serviceAreaId || data.serviceAreas[0].id }));
          }
        })
        .catch(() => toast.error("Failed to load schedule options"));
    }
  }, [createKind]);

  useEffect(() => {
    if (createKind !== "estimate" || !newEstimate.customerId) {
      setProperties([]);
      return;
    }

    fetch(`/api/customers/${newEstimate.customerId}/properties`)
      .then((r) => r.json())
      .then((data) => setProperties(Array.isArray(data) ? data : []))
      .catch(() => setProperties([]));
  }, [createKind, newEstimate.customerId]);

  function closeModal() {
    setCreateKind(null);
    setSaving(false);
    setNewCustomer({ name: "", email: "", phone: "", companyName: "" });
    const times = defaultVisitTimes();
    setNewVisit({
      title: "",
      division: "SERVICE",
      date: times.date,
      startTime: times.startTime,
      endTime: times.endTime,
      serviceAreaId: filterOptions.serviceAreas[0]?.id ?? "",
      assignedUserId: "",
      customerId: "",
      zip: "",
    });
    setNewEstimate({ customerId: "", propertyId: "" });
    setProperties([]);
  }

  async function submitCustomer(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCustomer),
      });
      if (!res.ok) {
        toast.error("Failed to create customer");
        return;
      }
      const customer = await res.json();
      closeModal();
      router.push(`/customers/${customer.id}`);
    } finally {
      setSaving(false);
    }
  }

  async function submitVisit(e: React.FormEvent) {
    e.preventDefault();
    if (!newVisit.title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!newVisit.serviceAreaId && !newVisit.zip.trim()) {
      toast.error("Select a service area or enter a zip code");
      return;
    }

    const startAt = new Date(`${newVisit.date}T${newVisit.startTime}`);
    const endAt = new Date(`${newVisit.date}T${newVisit.endTime}`);
    if (endAt <= startAt) {
      toast.error("End time must be after start time");
      return;
    }

    const selectedCustomer = customers.find((c) => c.id === newVisit.customerId);
    if (selectedCustomer?.doNotService) {
      toast.error("This customer is marked DO NOT SERVICE and cannot be scheduled");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/schedule/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newVisit.title.trim(),
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          division: newVisit.division,
          serviceAreaId: newVisit.serviceAreaId || undefined,
          assignedUserId: newVisit.assignedUserId || undefined,
          customerId: newVisit.customerId || undefined,
          zip: newVisit.zip.trim() || selectedCustomer?.zip || undefined,
          address: selectedCustomer?.address || undefined,
          city: selectedCustomer?.city || undefined,
          state: selectedCustomer?.state || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to create visit");
        return;
      }
      const visit = await res.json();
      closeModal();
      router.push(`/visits/${visit.id}`);
    } finally {
      setSaving(false);
    }
  }

  async function submitEstimate(e: React.FormEvent) {
    e.preventDefault();
    if (!newEstimate.customerId) {
      toast.error("Select a customer");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/estimates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: newEstimate.customerId,
          propertyId: newEstimate.propertyId || undefined,
        }),
      });
      if (!res.ok) {
        toast.error("Failed to create estimate");
        return;
      }
      const estimate = await res.json();
      closeModal();
      router.push(`/estimates/${estimate.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="dark" size="sm" className="rounded-full px-4">
            <Plus className="h-4 w-4" />
            New
            <ChevronDown className="h-3.5 w-3.5 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => setCreateKind("customer")}>
            <UserPlus />
            New customer
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setCreateKind("visit")}>
            <Calendar />
            New visit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setCreateKind("estimate")}>
            <FileText />
            New estimate
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateModal title="New customer" open={createKind === "customer"} onClose={closeModal}>
        <form onSubmit={submitCustomer} className="grid gap-3">
          <Input
            value={newCustomer.name}
            onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
            placeholder="Name"
            required
            autoFocus
          />
          <Input
            value={newCustomer.companyName}
            onChange={(e) => setNewCustomer({ ...newCustomer, companyName: e.target.value })}
            placeholder="Company (optional)"
          />
          <Input
            value={newCustomer.phone}
            onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
            placeholder="Phone"
          />
          <Input
            value={newCustomer.email}
            onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
            placeholder="Email"
            type="email"
          />
          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={saving}>
              Create
            </Button>
            <Button type="button" variant="outline" onClick={closeModal}>
              Cancel
            </Button>
          </div>
        </form>
      </CreateModal>

      <CreateModal title="New visit" open={createKind === "visit"} onClose={closeModal}>
        <form onSubmit={submitVisit} className="grid gap-3">
          <Input
            value={newVisit.title}
            onChange={(e) => setNewVisit({ ...newVisit, title: e.target.value })}
            placeholder="Visit title"
            required
            autoFocus
          />
          <select
            value={newVisit.division}
            onChange={(e) =>
              setNewVisit({ ...newVisit, division: e.target.value as "SERVICE" | "INSTALL" })
            }
            className={selectClassName}
          >
            <option value="SERVICE">Service</option>
            <option value="INSTALL">Install</option>
          </select>
          <Input
            type="date"
            value={newVisit.date}
            onChange={(e) => setNewVisit({ ...newVisit, date: e.target.value })}
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="time"
              value={newVisit.startTime}
              onChange={(e) => setNewVisit({ ...newVisit, startTime: e.target.value })}
              required
            />
            <Input
              type="time"
              value={newVisit.endTime}
              onChange={(e) => setNewVisit({ ...newVisit, endTime: e.target.value })}
              required
            />
          </div>
          <select
            value={newVisit.serviceAreaId}
            onChange={(e) => setNewVisit({ ...newVisit, serviceAreaId: e.target.value })}
            className={selectClassName}
          >
            <option value="">Service area</option>
            {filterOptions.serviceAreas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </select>
          <select
            value={newVisit.customerId}
            onChange={(e) => setNewVisit({ ...newVisit, customerId: e.target.value })}
            className={selectClassName}
          >
            <option value="">Customer (optional)</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
                {customer.doNotService ? " — DO NOT SERVICE" : ""}
              </option>
            ))}
          </select>
          <select
            value={newVisit.assignedUserId}
            onChange={(e) => setNewVisit({ ...newVisit, assignedUserId: e.target.value })}
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
            value={newVisit.zip}
            onChange={(e) => setNewVisit({ ...newVisit, zip: e.target.value })}
            placeholder="Zip (if no service area)"
          />
          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={saving}>
              Create
            </Button>
            <Button type="button" variant="outline" onClick={closeModal}>
              Cancel
            </Button>
          </div>
        </form>
      </CreateModal>

      <CreateModal title="New estimate" open={createKind === "estimate"} onClose={closeModal}>
        <form onSubmit={submitEstimate} className="grid gap-3">
          <select
            value={newEstimate.customerId}
            onChange={(e) =>
              setNewEstimate({ customerId: e.target.value, propertyId: "" })
            }
            className={selectClassName}
            required
            autoFocus
          >
            <option value="">Select customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
                {customer.doNotService ? " — DO NOT SERVICE" : ""}
              </option>
            ))}
          </select>
          {properties.length > 0 && (
            <select
              value={newEstimate.propertyId}
              onChange={(e) => setNewEstimate({ ...newEstimate, propertyId: e.target.value })}
              className={selectClassName}
            >
              <option value="">Property (optional)</option>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                  {property.address ? ` — ${property.address}` : ""}
                </option>
              ))}
            </select>
          )}
          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={saving || !newEstimate.customerId}>
              Create
            </Button>
            <Button type="button" variant="outline" onClick={closeModal}>
              Cancel
            </Button>
          </div>
        </form>
      </CreateModal>
    </>
  );
}
