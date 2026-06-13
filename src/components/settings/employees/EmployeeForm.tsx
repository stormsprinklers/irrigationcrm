"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/employees";

type ServiceAreaOption = { id: string; name: string; color: string };

export type EmployeeRecord = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: keyof typeof ROLE_LABELS;
  title: string | null;
  status: "ACTIVE" | "ARCHIVED";
  division: "INSTALL" | "SERVICE" | null;
  color: string | null;
  photoUrl: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  birthDate: string | null;
  tags: string[];
  serviceAreas: { serviceArea: ServiceAreaOption }[];
};

type Props = {
  employee: EmployeeRecord | null;
  serviceAreas: ServiceAreaOption[];
  onSaved: () => void;
  onCancel: () => void;
};

const ROLES = ["ADMIN", "MANAGER", "CSR", "TECH"] as const;

export function EmployeeForm({ employee, serviceAreas, onSaved, onCancel }: Props) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    role: "CSR" as (typeof ROLES)[number],
    title: "",
    division: "" as "" | "INSTALL" | "SERVICE",
    color: "#2563EB",
    photoUrl: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    birthDate: "",
    tags: "",
    serviceAreaIds: [] as string[],
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!employee) {
      setForm({
        name: "",
        email: "",
        phone: "",
        role: "CSR",
        title: "",
        division: "",
        color: "#2563EB",
        photoUrl: "",
        address: "",
        city: "",
        state: "",
        zip: "",
        birthDate: "",
        tags: "",
        serviceAreaIds: [],
      });
      return;
    }

    setForm({
      name: employee.name,
      email: employee.email,
      phone: employee.phone ?? "",
      role: employee.role,
      title: employee.title ?? "",
      division: employee.division ?? "",
      color: employee.color ?? "#2563EB",
      photoUrl: employee.photoUrl ?? "",
      address: employee.address ?? "",
      city: employee.city ?? "",
      state: employee.state ?? "",
      zip: employee.zip ?? "",
      birthDate: employee.birthDate ? employee.birthDate.slice(0, 10) : "",
      tags: employee.tags.join(", "),
      serviceAreaIds: employee.serviceAreas.map((sa) => sa.serviceArea.id),
    });
  }, [employee]);

  function toggleArea(areaId: string) {
    setForm((prev) => ({
      ...prev,
      serviceAreaIds: prev.serviceAreaIds.includes(areaId)
        ? prev.serviceAreaIds.filter((id) => id !== areaId)
        : [...prev.serviceAreaIds, areaId],
    }));
  }

  async function handlePhotoUpload(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload/employee-photo", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Upload failed");
        return;
      }
      setForm((prev) => ({ ...prev, photoUrl: data.url }));
      toast.success("Photo uploaded");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        email: form.email,
        phone: form.phone || null,
        role: form.role,
        title: form.title || null,
        division: form.division || null,
        color: form.color,
        photoUrl: form.photoUrl || null,
        address: form.address || null,
        city: form.city || null,
        state: form.state || null,
        zip: form.zip || null,
        birthDate: form.birthDate || null,
        tags: form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        serviceAreaIds: form.serviceAreaIds,
      };

      const url = employee ? `/api/settings/employees/${employee.id}` : "/api/settings/employees";
      const method = employee ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Save failed");
        return;
      }
      if (data.tempPassword) {
        toast.message(`Employee created. Temp password: ${data.tempPassword}`);
      } else {
        toast.success(employee ? "Employee updated" : "Employee created");
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const initials = form.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-white p-4">
      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16 ring-2" style={{ outlineColor: form.color }}>
          {form.photoUrl ? <AvatarImage src={form.photoUrl} alt={form.name} /> : null}
          <AvatarFallback style={{ backgroundColor: form.color, color: "#fff" }}>
            {initials || "?"}
          </AvatarFallback>
        </Avatar>
        <div>
          <label className="text-sm font-medium">Photo</label>
          <Input
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handlePhotoUpload(file);
            }}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Color</label>
          <input
            type="color"
            value={form.color}
            onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))}
            className="mt-1 block h-10 w-14 cursor-pointer rounded border border-border"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium">Name</label>
          <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
        </div>
        <div>
          <label className="text-sm font-medium">Email</label>
          <Input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} required />
        </div>
        <div>
          <label className="text-sm font-medium">Phone</label>
          <Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
        </div>
        <div>
          <label className="text-sm font-medium">Title</label>
          <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Lead Technician" />
        </div>
        <div>
          <label className="text-sm font-medium">Role</label>
          <select
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
            value={form.role}
            onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as (typeof ROLES)[number] }))}
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[form.role]}</p>
        </div>
        <div>
          <label className="text-sm font-medium">Division</label>
          <select
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
            value={form.division}
            onChange={(e) => setForm((p) => ({ ...p, division: e.target.value as "" | "INSTALL" | "SERVICE" }))}
          >
            <option value="">None</option>
            <option value="INSTALL">Install</option>
            <option value="SERVICE">Service</option>
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium">Address</label>
          <Input value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
        </div>
        <div>
          <label className="text-sm font-medium">City</label>
          <Input value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} />
        </div>
        <div>
          <label className="text-sm font-medium">State</label>
          <Input value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))} />
        </div>
        <div>
          <label className="text-sm font-medium">Zip</label>
          <Input value={form.zip} onChange={(e) => setForm((p) => ({ ...p, zip: e.target.value }))} />
        </div>
        <div>
          <label className="text-sm font-medium">Birth date</label>
          <Input type="date" value={form.birthDate} onChange={(e) => setForm((p) => ({ ...p, birthDate: e.target.value }))} />
        </div>
        <div>
          <label className="text-sm font-medium">Tags</label>
          <Input value={form.tags} onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))} placeholder="install, senior" />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Service areas</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {serviceAreas.map((area) => (
            <button
              key={area.id}
              type="button"
              onClick={() => toggleArea(area.id)}
              className={`rounded-full border px-3 py-1 text-xs ${
                form.serviceAreaIds.includes(area.id)
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground"
              }`}
            >
              {area.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : employee ? "Save changes" : "Create employee"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
