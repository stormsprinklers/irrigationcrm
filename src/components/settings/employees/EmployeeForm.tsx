"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ImageCropDialog } from "@/components/ui/ImageCropDialog";
import { blobProxyUrl } from "@/lib/blob/urls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, PAY_TYPE_LABELS, employeeInitials, formatEmployeeName, splitFullName } from "@/lib/employees";
import { EmployeeTrainingPanel } from "./EmployeeTrainingPanel";

type ServiceAreaOption = { id: string; name: string; color: string };

export type EmployeeRecord = {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phone: string | null;
  role: keyof typeof ROLE_LABELS;
  title: string | null;
  websiteTeamSlug: string | null;
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
  payType: "HOURLY" | "COMMISSION" | "HYBRID" | "SALARY" | null;
  hourlyRate: number | null;
  commissionPercent: number | null;
  annualSalary: number | null;
  lmsUserId?: string | null;
  lmsSyncStatus?: string | null;
  lmsLastSyncedAt?: string | null;
  serviceAreas: { serviceArea: ServiceAreaOption }[];
};

type Props = {
  employee: EmployeeRecord | null;
  serviceAreas: ServiceAreaOption[];
  onSaved: () => void;
  onCancel: () => void;
};

const ROLES = ["ADMIN", "MANAGER", "CSR", "TECH", "INSTALLER", "SALES", "SOCIAL_MEDIA_MANAGER"] as const;
const PAY_TYPES = ["", "HOURLY", "COMMISSION", "HYBRID", "SALARY"] as const;

export function EmployeeForm({ employee, serviceAreas, onSaved, onCancel }: Props) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    role: "CSR" as (typeof ROLES)[number],
    title: "",
    websiteTeamSlug: "",
    division: "" as "" | "INSTALL" | "SERVICE",
    color: "#2563EB",
    photoUrl: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    birthDate: "",
    tags: "",
    payType: "" as (typeof PAY_TYPES)[number],
    hourlyRate: "",
    commissionPercent: "",
    annualSalary: "",
    serviceAreaIds: [] as string[],
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropFileName, setCropFileName] = useState("photo.jpg");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [techPayDefaults, setTechPayDefaults] = useState<{
    payType: string;
    hourlyRate: number;
    commissionPercent: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  useEffect(() => {
    fetch("/api/settings/compensation")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setTechPayDefaults({
          payType: data.defaultTechnicianPayType,
          hourlyRate: data.defaultTechnicianHourlyRate,
          commissionPercent: data.defaultTechnicianCommissionPercent,
        });
      })
      .catch(() => {});
  }, []);

  function applyTechnicianPayDefaults() {
    if (!techPayDefaults) return;
    setForm((prev) => ({
      ...prev,
      payType: techPayDefaults.payType as (typeof PAY_TYPES)[number],
      hourlyRate: String(techPayDefaults.hourlyRate),
      commissionPercent: String(techPayDefaults.commissionPercent),
    }));
  }

  useEffect(() => {
    if (!employee) {
      setForm({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        role: "CSR",
        title: "",
        websiteTeamSlug: "",
        division: "",
        color: "#2563EB",
        photoUrl: "",
        address: "",
        city: "",
        state: "",
        zip: "",
        birthDate: "",
        tags: "",
        payType: "",
        hourlyRate: "",
        commissionPercent: "",
        annualSalary: "",
        serviceAreaIds: [],
      });
      setPassword("");
      setConfirmPassword("");
      return;
    }

    const nameParts = employee.firstName
      ? { firstName: employee.firstName, lastName: employee.lastName }
      : splitFullName(employee.name);

    setForm({
      firstName: nameParts.firstName,
      lastName: nameParts.lastName,
      email: employee.email,
      phone: employee.phone ?? "",
      role: employee.role,
      title: employee.title ?? "",
      websiteTeamSlug: employee.websiteTeamSlug ?? "",
      division: employee.division ?? "",
      color: employee.color ?? "#2563EB",
      photoUrl: employee.photoUrl ?? "",
      address: employee.address ?? "",
      city: employee.city ?? "",
      state: employee.state ?? "",
      zip: employee.zip ?? "",
      birthDate: employee.birthDate ? employee.birthDate.slice(0, 10) : "",
      tags: employee.tags.join(", "),
      payType: employee.payType ?? "",
      hourlyRate: employee.hourlyRate != null ? String(employee.hourlyRate) : "",
      commissionPercent:
        employee.commissionPercent != null ? String(employee.commissionPercent) : "",
      annualSalary: employee.annualSalary != null ? String(employee.annualSalary) : "",
      serviceAreaIds: employee.serviceAreas.map((sa) => sa.serviceArea.id),
    });
    setPassword("");
    setConfirmPassword("");
  }, [employee]);

  function toggleArea(areaId: string) {
    setForm((prev) => ({
      ...prev,
      serviceAreaIds: prev.serviceAreaIds.includes(areaId)
        ? prev.serviceAreaIds.filter((id) => id !== areaId)
        : [...prev.serviceAreaIds, areaId],
    }));
  }

  function handlePhotoSelected(file: File) {
    const objectUrl = URL.createObjectURL(file);
    setCropFileName(file.name);
    setCropImageSrc(objectUrl);
  }

  function closeCropDialog() {
    if (cropImageSrc) URL.revokeObjectURL(cropImageSrc);
    setCropImageSrc(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
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

    if (isAdmin && password) {
      if (password.length < 8) {
        toast.error("Password must be at least 8 characters");
        return;
      }
      if (password !== confirmPassword) {
        toast.error("Passwords do not match");
        return;
      }
    }

    setSaving(true);
    try {
      if (employee && isAdmin && password) {
        const pwRes = await fetch(`/api/settings/employees/${employee.id}/password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password, confirmPassword }),
        });
        const pwData = await pwRes.json();
        if (!pwRes.ok) {
          toast.error(pwData.error ?? "Failed to set password");
          return;
        }
      }

      const payload: Record<string, unknown> = {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone || null,
        role: form.role,
        title: form.title || null,
        websiteTeamSlug: form.websiteTeamSlug || null,
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
        payType: form.payType || null,
        hourlyRate: form.hourlyRate ? Number(form.hourlyRate) : null,
        commissionPercent: form.commissionPercent ? Number(form.commissionPercent) : null,
        annualSalary: form.annualSalary ? Number(form.annualSalary) : null,
        serviceAreaIds: form.serviceAreaIds,
      };

      if (!employee && isAdmin && password) {
        payload.password = password;
        payload.confirmPassword = confirmPassword;
      }

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
        toast.message(`Employee created. Default login password: ${data.tempPassword}`);
      } else if (employee && isAdmin && password) {
        toast.success("Employee updated and login password set");
      } else {
        toast.success(employee ? "Employee updated" : "Employee created");
      }
      if (data.lmsSyncError) {
        toast.error(`LMS sync failed: ${data.lmsSyncError}`);
      } else if (data.lmsSyncStatus === "synced") {
        toast.message("Synced to LMS");
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const displayName = formatEmployeeName(form.firstName, form.lastName);
  const initials = employeeInitials(form.firstName, form.lastName);

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-white p-4">
      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16 ring-2" style={{ outlineColor: form.color }}>
          {form.photoUrl ? (
            <AvatarImage src={blobProxyUrl(form.photoUrl)} alt={displayName} />
          ) : null}
          <AvatarFallback style={{ backgroundColor: form.color, color: "#fff" }}>
            {initials || "?"}
          </AvatarFallback>
        </Avatar>
        <div>
          <label className="text-sm font-medium">Photo</label>
          <Input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handlePhotoSelected(file);
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
          <label className="text-sm font-medium">First name</label>
          <Input value={form.firstName} onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))} required />
        </div>
        <div>
          <label className="text-sm font-medium">Last name</label>
          <Input value={form.lastName} onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))} />
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
          <label className="text-sm font-medium">Website team slug</label>
          <Input
            value={form.websiteTeamSlug}
            onChange={(e) => setForm((p) => ({ ...p, websiteTeamSlug: e.target.value }))}
            placeholder="jason-beadle"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Used for {"{about_technician_link}"} in customer messages (/team/slug on your website).
          </p>
        </div>
        <div>
          <label className="text-sm font-medium">Role</label>
          <select
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
            value={form.role}
            onChange={(e) => {
              const nextRole = e.target.value as (typeof ROLES)[number];
              setForm((p) => {
                const next = {
                  ...p,
                  role: nextRole,
                  ...(nextRole === "TECH" ? { division: "SERVICE" as const } : {}),
                };
                if (nextRole === "TECH" && !employee && techPayDefaults && !p.payType) {
                  return {
                    ...next,
                    payType: techPayDefaults.payType as (typeof PAY_TYPES)[number],
                    hourlyRate: String(techPayDefaults.hourlyRate),
                    commissionPercent: String(techPayDefaults.commissionPercent),
                  };
                }
                return next;
              });
            }}
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

      <div className="rounded-md border border-border p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Compensation</h3>
          {!employee && form.role === "TECH" && techPayDefaults ? (
            <Button type="button" size="sm" variant="outline" onClick={applyTechnicianPayDefaults}>
              Use technician defaults
            </Button>
          ) : null}
        </div>
        {form.payType === "HYBRID" ? (
          <p className="mb-3 text-xs text-muted-foreground">
            Hybrid employees are paid the higher of hourly earnings (including overtime) or
            commission on completed jobs.
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-sm font-medium">Pay type</label>
            <select
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
              value={form.payType}
              onChange={(e) =>
                setForm((p) => ({ ...p, payType: e.target.value as (typeof PAY_TYPES)[number] }))
              }
            >
              <option value="">Not configured</option>
              {(["HOURLY", "COMMISSION", "HYBRID", "SALARY"] as const).map((type) => (
                <option key={type} value={type}>
                  {PAY_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
          {(form.payType === "HOURLY" || form.payType === "HYBRID") && (
            <div>
              <label className="text-sm font-medium">Hourly rate ($)</label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.hourlyRate}
                onChange={(e) => setForm((p) => ({ ...p, hourlyRate: e.target.value }))}
              />
            </div>
          )}
          {(form.payType === "COMMISSION" || form.payType === "HYBRID") && (
            <div>
              <label className="text-sm font-medium">Commission (%)</label>
              <Input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={form.commissionPercent}
                onChange={(e) => setForm((p) => ({ ...p, commissionPercent: e.target.value }))}
              />
            </div>
          )}
          {form.payType === "SALARY" && (
            <div>
              <label className="text-sm font-medium">Annual salary ($)</label>
              <Input
                type="number"
                min={0}
                step="100"
                value={form.annualSalary}
                onChange={(e) => setForm((p) => ({ ...p, annualSalary: e.target.value }))}
              />
            </div>
          )}
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

      {isAdmin ? (
        <div className="rounded-md border border-border p-4">
          <h3 className="text-sm font-semibold">Login access</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {employee
              ? "Set a new password for this employee to sign in. Leave blank to keep their current password."
              : "Set the password this employee will use to sign in. Leave blank to use the default password123."}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">{employee ? "New password" : "Password"}</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                placeholder={employee ? "Leave unchanged" : "At least 8 characters"}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Confirm password</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                placeholder={employee ? "Leave unchanged" : "Repeat password"}
              />
            </div>
          </div>
        </div>
      ) : null}

      {employee ? (
        <EmployeeTrainingPanel employeeId={employee.id} email={employee.email} />
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : employee ? "Save changes" : "Create employee"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      <ImageCropDialog
        open={Boolean(cropImageSrc)}
        imageSrc={cropImageSrc}
        fileName={cropFileName}
        title="Adjust employee photo"
        cropShape="round"
        onClose={closeCropDialog}
        onConfirm={handlePhotoUpload}
      />
    </form>
  );
}
