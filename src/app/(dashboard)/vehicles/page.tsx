"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { blobProxyUrl } from "@/lib/blob/urls";
import { isOilOverdue, oilStatusLabel } from "@/lib/vehicles/oil";
import { assigneeLabel, vehicleDisplayName } from "@/lib/vehicles/types";
import { cn } from "@/lib/utils";

type VehicleRow = {
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
  nextOilChangeDueAt: string | null;
  nextOilChangeDueMileage: number | null;
  assignedUser: { id: string; name: string; photoUrl: string | null } | null;
  openIssueCount: number;
};

type Employee = { id: string; name: string };

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "OUT_OF_SERVICE", label: "Out of service" },
  { value: "SOLD", label: "Sold" },
  { value: "ALL", label: "All statuses" },
];

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [assignee, setAssignee] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ employees: "1" });
      if (q.trim()) params.set("q", q.trim());
      if (status) params.set("status", status);
      if (assignee) params.set("assignee", assignee);
      const res = await fetch(`/api/vehicles?${params}`);
      if (!res.ok) {
        toast.error("Failed to load vehicles");
        return;
      }
      const data = await res.json();
      setVehicles(data.vehicles ?? []);
      setEmployees(data.employees ?? []);
      setCanManage(Boolean(data.canManage));
    } finally {
      setLoading(false);
    }
  }, [q, status, assignee]);

  useEffect(() => {
    void load();
  }, [load]);

  const assigneeOptions = useMemo(
    () => [{ id: "shop", name: "Shop" }, ...employees],
    [employees]
  );

  return (
    <ContentArea>
      <PageHeader
        title="Fleet"
        subtitle="Company vehicles, mileage, maintenance, and issues"
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/vehicles/new">
                <Plus className="mr-1.5 h-4 w-4" />
                Add vehicle
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search make, model, plate, or VIN…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
        >
          <option value="">All assignees</option>
          {assigneeOptions.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading vehicles…</p>
      ) : vehicles.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">No vehicles found.</p>
          {canManage ? (
            <Button asChild className="mt-4" variant="outline">
              <Link href="/vehicles/new">Add your first vehicle</Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Vehicle</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Assignee</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Mileage</th>
                <th className="px-4 py-3 font-medium">Oil</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">Issues</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => {
                const photo = blobProxyUrl(v.photoUrl);
                const oilLabel = oilStatusLabel({
                  nextOilChangeDueAt: v.nextOilChangeDueAt
                    ? new Date(v.nextOilChangeDueAt)
                    : null,
                  nextOilChangeDueMileage: v.nextOilChangeDueMileage,
                  currentMileage: v.currentMileage,
                });
                const overdue = isOilOverdue({
                  nextOilChangeDueAt: v.nextOilChangeDueAt
                    ? new Date(v.nextOilChangeDueAt)
                    : null,
                  nextOilChangeDueMileage: v.nextOilChangeDueMileage,
                  currentMileage: v.currentMileage,
                });
                return (
                  <tr key={v.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link href={`/vehicles/${v.id}`} className="flex items-center gap-3">
                        <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded bg-muted">
                          {photo ? (
                            <Image src={photo} alt="" fill className="object-cover" unoptimized />
                          ) : (
                            <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
                              No photo
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-foreground">
                            {vehicleDisplayName(v)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {v.vin ? `VIN ${v.vin}` : "No VIN"} · {v.status.replaceAll("_", " ")}
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      {assigneeLabel(v.assignedUser)}
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      {v.currentMileage.toLocaleString()} mi
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                          overdue
                            ? "bg-destructive/15 text-destructive"
                            : oilLabel === "Due soon"
                              ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                              : "bg-muted text-muted-foreground"
                        )}
                      >
                        {oilLabel}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      {v.openIssueCount > 0 ? (
                        <span className="text-destructive">{v.openIssueCount} open</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </ContentArea>
  );
}
