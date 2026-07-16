"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmployeeSearchPicker } from "@/components/schedule/EmployeeSearchPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { blobProxyUrl } from "@/lib/blob/urls";
import { isOilOverdue, oilStatusLabel } from "@/lib/vehicles/oil";
import { assigneeLabel, vehicleDisplayName } from "@/lib/vehicles/types";
import { cn } from "@/lib/utils";

type Employee = { id: string; name: string };

type Attachment = {
  id: string;
  blobUrl: string;
  fileName: string;
  mimeType: string;
  kind: "PHOTO" | "RECEIPT" | "WORK_SUMMARY" | "CARFAX" | "OTHER";
  createdAt: string;
  uploadedBy: { id: string; name: string };
};

type MileageLog = {
  id: string;
  mileage: number;
  recordedAt: string;
  note: string | null;
  recordedBy: { id: string; name: string };
};

type ServiceRecord = {
  id: string;
  title: string;
  description: string | null;
  performedAt: string;
  mileageAtService: number | null;
  cost: string | number | null;
  vendor: string | null;
  performedBy: { id: string; name: string } | null;
};

type Issue = {
  id: string;
  title: string;
  description: string | null;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED";
  reportedAt: string;
  resolutionNote: string | null;
  reportedBy: { id: string; name: string };
  resolvedBy: { id: string; name: string } | null;
};

type Vehicle = {
  id: string;
  make: string;
  model: string;
  year: number;
  vin: string | null;
  licensePlate: string | null;
  photoUrl: string | null;
  assignedUserId: string | null;
  status: "ACTIVE" | "SOLD" | "OUT_OF_SERVICE";
  currentMileage: number;
  lastOilChangeAt: string | null;
  lastOilChangeMileage: number | null;
  oilIntervalMiles: number;
  oilIntervalMonths: number;
  nextOilChangeDueAt: string | null;
  nextOilChangeDueMileage: number | null;
  aiSummary: string | null;
  notes: string | null;
  assignedUser: { id: string; name: string; photoUrl: string | null } | null;
  attachments: Attachment[];
  mileageLogs: MileageLog[];
  serviceRecords: ServiceRecord[];
  issues: Issue[];
};

const ATTACHMENT_KINDS = [
  { value: "ALL", label: "All" },
  { value: "PHOTO", label: "Photos" },
  { value: "RECEIPT", label: "Receipts" },
  { value: "WORK_SUMMARY", label: "Work summaries" },
  { value: "CARFAX", label: "Carfax" },
  { value: "OTHER", label: "Other" },
] as const;

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

function Section({
  title,
  children,
  actions,
}: {
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export default function VehicleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [attachmentKindFilter, setAttachmentKindFilter] = useState("ALL");
  const [uploadKind, setUploadKind] = useState("RECEIPT");

  const [editMake, setEditMake] = useState("");
  const [editModel, setEditModel] = useState("");
  const [editYear, setEditYear] = useState("");
  const [editVin, setEditVin] = useState("");
  const [editPlate, setEditPlate] = useState("");
  const [editStatus, setEditStatus] = useState("ACTIVE");
  const [editNotes, setEditNotes] = useState("");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [assignedUserName, setAssignedUserName] = useState("");
  const [oilIntervalMiles, setOilIntervalMiles] = useState("5000");
  const [oilIntervalMonths, setOilIntervalMonths] = useState("6");
  const [lastOilChangeAt, setLastOilChangeAt] = useState("");
  const [lastOilChangeMileage, setLastOilChangeMileage] = useState("");

  const [mileageInput, setMileageInput] = useState("");
  const [mileageNote, setMileageNote] = useState("");
  const [serviceTitle, setServiceTitle] = useState("");
  const [serviceDescription, setServiceDescription] = useState("");
  const [serviceMileage, setServiceMileage] = useState("");
  const [serviceCost, setServiceCost] = useState("");
  const [serviceVendor, setServiceVendor] = useState("");
  const [serviceOilChange, setServiceOilChange] = useState(false);
  const [issueTitle, setIssueTitle] = useState("");
  const [issueDescription, setIssueDescription] = useState("");

  const syncForm = useCallback((v: Vehicle) => {
    setEditMake(v.make);
    setEditModel(v.model);
    setEditYear(String(v.year));
    setEditVin(v.vin ?? "");
    setEditPlate(v.licensePlate ?? "");
    setEditStatus(v.status);
    setEditNotes(v.notes ?? "");
    setAssignedUserId(v.assignedUserId ?? "");
    setAssignedUserName(v.assignedUser?.name ?? "");
    setOilIntervalMiles(String(v.oilIntervalMiles));
    setOilIntervalMonths(String(v.oilIntervalMonths));
    setLastOilChangeAt(v.lastOilChangeAt ? v.lastOilChangeAt.slice(0, 10) : "");
    setLastOilChangeMileage(
      v.lastOilChangeMileage != null ? String(v.lastOilChangeMileage) : ""
    );
  }, []);

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setLoading(true);
    try {
      const [detailRes, listRes] = await Promise.all([
        fetch(`/api/vehicles/${id}`),
        fetch("/api/vehicles?employees=1&status=ALL"),
      ]);
      if (!detailRes.ok) {
        toast.error("Vehicle not found");
        router.replace("/vehicles");
        return;
      }
      const detail = await detailRes.json();
      setVehicle(detail.vehicle);
      setCanManage(Boolean(detail.canManage));
      syncForm(detail.vehicle);
      if (listRes.ok) {
        const list = await listRes.json();
        setEmployees(list.employees ?? []);
      }
    } finally {
      if (!opts?.quiet) setLoading(false);
    }
  }, [id, router, syncForm]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredAttachments = useMemo(() => {
    if (!vehicle) return [];
    if (attachmentKindFilter === "ALL") return vehicle.attachments;
    return vehicle.attachments.filter((a) => a.kind === attachmentKindFilter);
  }, [vehicle, attachmentKindFilter]);

  const oilLabel = vehicle
    ? oilStatusLabel({
        nextOilChangeDueAt: vehicle.nextOilChangeDueAt
          ? new Date(vehicle.nextOilChangeDueAt)
          : null,
        nextOilChangeDueMileage: vehicle.nextOilChangeDueMileage,
        currentMileage: vehicle.currentMileage,
      })
    : "—";
  const overdue = vehicle
    ? isOilOverdue({
        nextOilChangeDueAt: vehicle.nextOilChangeDueAt
          ? new Date(vehicle.nextOilChangeDueAt)
          : null,
        nextOilChangeDueMileage: vehicle.nextOilChangeDueMileage,
        currentMileage: vehicle.currentMileage,
      })
    : false;

  async function saveVehicle() {
    if (!canManage) {
      toast.error("Only admins and managers can edit vehicle profile notes.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/vehicles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          make: editMake,
          model: editModel,
          year: Number(editYear),
          vin: editVin || null,
          licensePlate: editPlate || null,
          status: editStatus,
          notes: editNotes,
          assignedUserId: assignedUserId || null,
          oilIntervalMiles: Number(oilIntervalMiles) || 5000,
          oilIntervalMonths: Number(oilIntervalMonths) || 6,
          lastOilChangeAt: lastOilChangeAt || null,
          lastOilChangeMileage: lastOilChangeMileage || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to save");
        return;
      }
      // Keep notes in local state immediately so a slow reload can't look like a failed save.
      if (typeof data.notes === "string" || data.notes === null) {
        setEditNotes(data.notes ?? "");
        setVehicle((prev) => (prev ? { ...prev, notes: data.notes ?? null } : prev));
      }
      toast.success("Vehicle updated");
      await load({ quiet: true });
    } finally {
      setSaving(false);
    }
  }

  async function uploadPhoto(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`/api/vehicles/${id}/photo`, { method: "POST", body: formData });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "Photo upload failed");
      return;
    }
    toast.success("Photo updated");
    await load();
  }

  async function addMileage(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/vehicles/${id}/mileage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mileage: Number(mileageInput),
        note: mileageNote || null,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "Failed to log mileage");
      return;
    }
    setMileageInput("");
    setMileageNote("");
    toast.success("Mileage logged");
    await load();
  }

  async function addService(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/vehicles/${id}/service`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: serviceTitle,
        description: serviceDescription || null,
        mileageAtService: serviceMileage || null,
        cost: serviceCost || null,
        vendor: serviceVendor || null,
        isOilChange: serviceOilChange,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "Failed to add service");
      return;
    }
    setServiceTitle("");
    setServiceDescription("");
    setServiceMileage("");
    setServiceCost("");
    setServiceVendor("");
    setServiceOilChange(false);
    toast.success("Service recorded");
    await load();
  }

  async function addIssue(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/vehicles/${id}/issues`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: issueTitle,
        description: issueDescription || null,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "Failed to log issue");
      return;
    }
    setIssueTitle("");
    setIssueDescription("");
    toast.success("Issue logged");
    await load();
  }

  async function updateIssueStatus(issueId: string, status: Issue["status"]) {
    const res = await fetch(`/api/vehicles/${id}/issues`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issueId, status }),
    });
    if (!res.ok) {
      toast.error("Failed to update issue");
      return;
    }
    await load();
  }

  async function uploadAttachment(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("kind", uploadKind);
    const res = await fetch(`/api/vehicles/${id}/attachments`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "Upload failed");
      return;
    }
    toast.success("Document uploaded");
    await load();
  }

  async function deleteAttachment(attachmentId: string) {
    const res = await fetch(
      `/api/vehicles/${id}/attachments?attachmentId=${encodeURIComponent(attachmentId)}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      toast.error("Failed to delete");
      return;
    }
    await load();
  }

  async function runSummarize(force: boolean) {
    setSummarizing(true);
    try {
      const res = await fetch(`/api/vehicles/${id}/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Summary failed");
        return;
      }
      toast.success(force ? "Summary regenerated" : "Summary generated");
      await load();
    } finally {
      setSummarizing(false);
    }
  }

  async function deleteVehicle() {
    if (!canManage) return;
    if (!confirm("Delete this vehicle and all related records?")) return;
    const res = await fetch(`/api/vehicles/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete");
      return;
    }
    toast.success("Vehicle deleted");
    router.push("/vehicles");
  }

  if (loading || !vehicle) {
    return (
      <ContentArea>
        <p className="text-sm text-muted-foreground">Loading vehicle…</p>
      </ContentArea>
    );
  }

  const photo = blobProxyUrl(vehicle.photoUrl);
  const openIssues = vehicle.issues.filter((i) => i.status !== "RESOLVED");

  return (
    <ContentArea className="max-w-5xl space-y-6">
      <PageHeader
        breadcrumb={["Vehicles", vehicleDisplayName(vehicle)]}
        title={vehicleDisplayName(vehicle)}
        subtitle={`${assigneeLabel(vehicle.assignedUser)} · ${vehicle.status.replaceAll("_", " ")}`}
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/vehicles">Back</Link>
            </Button>
            {canManage ? (
              <Button variant="destructive" onClick={() => void deleteVehicle()}>
                Delete
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <div className="space-y-3">
          <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-border bg-muted">
            {photo ? (
              <Image src={photo} alt="" fill className="object-cover" unoptimized />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No photo
              </div>
            )}
          </div>
          {canManage ? (
            <>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadPhoto(file);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => photoInputRef.current?.click()}
              >
                <Upload className="mr-1.5 h-4 w-4" />
                Upload photo
              </Button>
            </>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">Mileage</div>
              <div className="text-lg font-semibold">
                {vehicle.currentMileage.toLocaleString()} mi
              </div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">Oil status</div>
              <div
                className={cn(
                  "text-lg font-semibold",
                  overdue ? "text-destructive" : undefined
                )}
              >
                {oilLabel}
              </div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">Open issues</div>
              <div className="text-lg font-semibold">{openIssues.length}</div>
            </div>
          </div>

          <Section
            title="AI summary"
            actions={
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={summarizing}
                onClick={() => void runSummarize(Boolean(vehicle.aiSummary))}
              >
                {summarizing ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                {vehicle.aiSummary ? "Regenerate" : "Generate"}
              </Button>
            }
          >
            <p className="text-sm leading-relaxed text-foreground">
              {vehicle.aiSummary || "No summary yet. Generate one from mileage, service, and issues."}
            </p>
          </Section>
        </div>
      </div>

      {canManage ? (
        <Section title="Profile">
          <form
            id="vehicle-profile-form"
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void saveVehicle();
            }}
          >
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Year</label>
              <Input value={editYear} onChange={(e) => setEditYear(e.target.value)} type="number" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Make</label>
              <Input value={editMake} onChange={(e) => setEditMake(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Model</label>
              <Input value={editModel} onChange={(e) => setEditModel(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">VIN</label>
              <Input value={editVin} onChange={(e) => setEditVin(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">License plate</label>
              <Input value={editPlate} onChange={(e) => setEditPlate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
              >
                <option value="ACTIVE">Active</option>
                <option value="OUT_OF_SERVICE">Out of service</option>
                <option value="SOLD">Sold</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Assigned to (empty = Shop)</label>
            <EmployeeSearchPicker
              value={assignedUserId}
              selectedName={assignedUserName}
              employees={employees}
              placeholder="Search employees…"
              onValueChange={(eid, name) => {
                setAssignedUserId(eid);
                setAssignedUserName(name);
              }}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="vehicle-notes">
              Notes
            </label>
            <textarea
              id="vehicle-notes"
              className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              rows={3}
              placeholder="Vehicle notes…"
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
          </form>
        </Section>
      ) : (
        <Section title="Profile">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">VIN</dt>
              <dd>{vehicle.vin || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Plate</dt>
              <dd>{vehicle.licensePlate || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Assignee</dt>
              <dd>{assigneeLabel(vehicle.assignedUser)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Notes</dt>
              <dd>{vehicle.notes || "—"}</dd>
            </div>
          </dl>
        </Section>
      )}

      <Section title="Mileage">
        <form onSubmit={addMileage} className="mb-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Input
            type="number"
            min={0}
            required
            placeholder="Current mileage"
            value={mileageInput}
            onChange={(e) => setMileageInput(e.target.value)}
          />
          <Input
            placeholder="Note (optional)"
            value={mileageNote}
            onChange={(e) => setMileageNote(e.target.value)}
          />
          <Button type="submit">Log mileage</Button>
        </form>
        <ul className="space-y-2 text-sm">
          {vehicle.mileageLogs.length === 0 ? (
            <li className="text-muted-foreground">No mileage logs yet.</li>
          ) : (
            vehicle.mileageLogs.map((log) => (
              <li
                key={log.id}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 py-2 last:border-0"
              >
                <span className="font-medium">{log.mileage.toLocaleString()} mi</span>
                <span className="text-muted-foreground">
                  {formatDate(log.recordedAt)} · {log.recordedBy.name}
                  {log.note ? ` · ${log.note}` : ""}
                </span>
              </li>
            ))
          )}
        </ul>
      </Section>

      <Section
        title="Oil / scheduled maintenance"
        actions={
          canManage ? (
            <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void saveVehicle()}>
              Save oil settings
            </Button>
          ) : null
        }
      >
        <div className="mb-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">Last change: </span>
            {formatDate(vehicle.lastOilChangeAt)}
            {vehicle.lastOilChangeMileage != null
              ? ` @ ${vehicle.lastOilChangeMileage.toLocaleString()} mi`
              : ""}
          </div>
          <div>
            <span className="text-muted-foreground">Next due: </span>
            {formatDate(vehicle.nextOilChangeDueAt)}
            {vehicle.nextOilChangeDueMileage != null
              ? ` / ${vehicle.nextOilChangeDueMileage.toLocaleString()} mi`
              : ""}
          </div>
        </div>
        {canManage ? (
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Interval miles</label>
              <Input
                type="number"
                value={oilIntervalMiles}
                onChange={(e) => setOilIntervalMiles(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Interval months</label>
              <Input
                type="number"
                value={oilIntervalMonths}
                onChange={(e) => setOilIntervalMonths(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Last oil date</label>
              <Input
                type="date"
                value={lastOilChangeAt}
                onChange={(e) => setLastOilChangeAt(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Last oil mileage</label>
              <Input
                type="number"
                value={lastOilChangeMileage}
                onChange={(e) => setLastOilChangeMileage(e.target.value)}
              />
            </div>
          </div>
        ) : null}
      </Section>

      <Section title="Service history">
        <form onSubmit={addService} className="mb-4 space-y-3 rounded-md border border-dashed border-border p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              required
              placeholder="Service title"
              value={serviceTitle}
              onChange={(e) => setServiceTitle(e.target.value)}
            />
            <Input
              placeholder="Vendor (optional)"
              value={serviceVendor}
              onChange={(e) => setServiceVendor(e.target.value)}
            />
            <Input
              type="number"
              placeholder="Mileage at service"
              value={serviceMileage}
              onChange={(e) => setServiceMileage(e.target.value)}
            />
            <Input
              type="number"
              step="0.01"
              placeholder="Cost"
              value={serviceCost}
              onChange={(e) => setServiceCost(e.target.value)}
            />
          </div>
          <textarea
            className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Description"
            value={serviceDescription}
            onChange={(e) => setServiceDescription(e.target.value)}
            rows={2}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={serviceOilChange}
              onChange={(e) => setServiceOilChange(e.target.checked)}
            />
            This was an oil change
          </label>
          <Button type="submit">Add service record</Button>
        </form>
        <ul className="space-y-3 text-sm">
          {vehicle.serviceRecords.length === 0 ? (
            <li className="text-muted-foreground">No service records yet.</li>
          ) : (
            vehicle.serviceRecords.map((rec) => (
              <li key={rec.id} className="border-b border-border/60 pb-3 last:border-0">
                <div className="font-medium">{rec.title}</div>
                <div className="text-muted-foreground">
                  {formatDate(rec.performedAt)}
                  {rec.mileageAtService != null
                    ? ` · ${rec.mileageAtService.toLocaleString()} mi`
                    : ""}
                  {rec.performedBy ? ` · ${rec.performedBy.name}` : ""}
                  {rec.vendor ? ` · ${rec.vendor}` : ""}
                  {rec.cost != null ? ` · $${Number(rec.cost).toFixed(2)}` : ""}
                </div>
                {rec.description ? <p className="mt-1">{rec.description}</p> : null}
              </li>
            ))
          )}
        </ul>
      </Section>

      <Section title="Issues">
        <form onSubmit={addIssue} className="mb-4 space-y-3 rounded-md border border-dashed border-border p-3">
          <Input
            required
            placeholder="Issue title"
            value={issueTitle}
            onChange={(e) => setIssueTitle(e.target.value)}
          />
          <textarea
            className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Description"
            value={issueDescription}
            onChange={(e) => setIssueDescription(e.target.value)}
            rows={2}
          />
          <Button type="submit">Log issue</Button>
        </form>
        <ul className="space-y-3 text-sm">
          {vehicle.issues.length === 0 ? (
            <li className="text-muted-foreground">No issues logged.</li>
          ) : (
            vehicle.issues.map((issue) => (
              <li
                key={issue.id}
                className={cn(
                  "rounded-md border p-3",
                  issue.status === "RESOLVED"
                    ? "border-border opacity-70"
                    : "border-destructive/30 bg-destructive/5"
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{issue.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {issue.status.replaceAll("_", " ")} · {formatDate(issue.reportedAt)} ·{" "}
                      {issue.reportedBy.name}
                    </div>
                    {issue.description ? <p className="mt-1">{issue.description}</p> : null}
                    {issue.resolutionNote ? (
                      <p className="mt-1 text-muted-foreground">Resolution: {issue.resolutionNote}</p>
                    ) : null}
                  </div>
                  <div className="flex gap-1">
                    {issue.status !== "IN_PROGRESS" && issue.status !== "RESOLVED" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void updateIssueStatus(issue.id, "IN_PROGRESS")}
                      >
                        Start
                      </Button>
                    ) : null}
                    {issue.status !== "RESOLVED" ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void updateIssueStatus(issue.id, "RESOLVED")}
                      >
                        Resolve
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void updateIssueStatus(issue.id, "OPEN")}
                      >
                        Reopen
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </Section>

      <Section title="Documents">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {ATTACHMENT_KINDS.map((k) => (
            <Button
              key={k.value}
              type="button"
              size="sm"
              variant={attachmentKindFilter === k.value ? "default" : "outline"}
              onClick={() => setAttachmentKindFilter(k.value)}
            >
              {k.label}
            </Button>
          ))}
        </div>
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">Upload as</label>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={uploadKind}
              onChange={(e) => setUploadKind(e.target.value)}
            >
              <option value="RECEIPT">Receipt</option>
              <option value="WORK_SUMMARY">Work summary</option>
              <option value="CARFAX">Carfax</option>
              <option value="PHOTO">Photo</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <input
            ref={attachmentInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadAttachment(file);
              e.target.value = "";
            }}
          />
          <Button type="button" variant="outline" onClick={() => attachmentInputRef.current?.click()}>
            <Upload className="mr-1.5 h-4 w-4" />
            Upload file
          </Button>
        </div>
        {filteredAttachments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No documents in this filter.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredAttachments.map((att) => {
              const url = blobProxyUrl(att.blobUrl);
              const isImage = att.mimeType.startsWith("image/");
              return (
                <div key={att.id} className="overflow-hidden rounded-md border border-border">
                  {isImage && url ? (
                    <a href={url} target="_blank" rel="noreferrer" className="relative block aspect-video bg-muted">
                      <Image src={url} alt={att.fileName} fill className="object-cover" unoptimized />
                    </a>
                  ) : (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex aspect-video items-center justify-center gap-2 bg-muted text-sm text-muted-foreground"
                    >
                      <FileText className="h-5 w-5" />
                      PDF / file
                    </a>
                  )}
                  <div className="flex items-start justify-between gap-2 p-2 text-xs">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{att.fileName}</div>
                      <div className="text-muted-foreground">
                        {att.kind.replaceAll("_", " ")} · {att.uploadedBy.name}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      onClick={() => void deleteAttachment(att.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </ContentArea>
  );
}
