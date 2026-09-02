"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ROLE_LABELS } from "@/lib/employees";
import type { UserRole } from "@prisma/client";

type CompanyOption = { id: string; name: string };

type SourceEmployee = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  title: string | null;
  status: string;
  phone: string | null;
  match: "available" | "exists" | "linked";
};

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function SyncEmployeesFromCompanyModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentCompany, setCurrentCompany] = useState<CompanyOption | null>(null);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [sourceCompanyId, setSourceCompanyId] = useState("");
  const [employees, setEmployees] = useState<SourceEmployee[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setEmployees([]);
    setSelectedIds([]);
    setSourceCompanyId("");
    setLoading(true);
    fetch("/api/settings/employees/sync")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setCurrentCompany(data?.currentCompany ?? null);
        const nextCompanies = (data?.companies ?? []) as CompanyOption[];
        setCompanies(nextCompanies);
        if (nextCompanies.length === 1) {
          setSourceCompanyId(nextCompanies[0].id);
        }
      })
      .catch(() => toast.error("Failed to load companies"))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open || !sourceCompanyId) {
      setEmployees([]);
      setSelectedIds([]);
      return;
    }
    setLoading(true);
    fetch(`/api/settings/employees/sync?sourceCompanyId=${encodeURIComponent(sourceCompanyId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const rows = (data?.employees ?? []) as SourceEmployee[];
        setEmployees(rows);
        setSelectedIds(
          rows
            .filter((row) => row.match === "available" && row.status === "ACTIVE")
            .map((row) => row.id)
        );
      })
      .catch(() => toast.error("Failed to load employees"))
      .finally(() => setLoading(false));
  }, [open, sourceCompanyId]);

  const selectable = useMemo(
    () => employees.filter((row) => row.match !== "linked"),
    [employees]
  );
  const allSelectableChecked =
    selectable.length > 0 && selectable.every((row) => selectedIds.includes(row.id));

  function toggle(id: string, enabled: boolean) {
    setSelectedIds((prev) => {
      if (!enabled) return prev.filter((value) => value !== id);
      if (prev.includes(id)) return prev;
      return [...prev, id];
    });
  }

  async function submit() {
    if (!sourceCompanyId || selectedIds.length === 0) {
      toast.error("Select at least one employee");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/employees/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceCompanyId, employeeIds: selectedIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to copy employees");
        return;
      }
      const created = data.created?.length ?? 0;
      const linked = data.linked?.length ?? 0;
      const skipped = data.skipped?.length ?? 0;
      const parts = [
        created ? `${created} added` : null,
        linked ? `${linked} linked` : null,
        skipped ? `${skipped} skipped` : null,
      ].filter(Boolean);
      toast.success(parts.length ? parts.join(" · ") : "No employees changed");
      onImported();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-3 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 flex max-h-[min(86dvh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-lg border bg-background shadow-lg">
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="font-semibold">Bring employees from another company</h2>
            <p className="text-xs text-muted-foreground">
              Copy selected people into {currentCompany?.name ?? "this company"} and link their
              logins so they can switch companies.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {companies.length === 0 && !loading ? (
            <p className="text-sm text-muted-foreground">
              Link or sign in to another company first. You can only copy employees from a company
              your account can switch into. Use the company switcher in the account menu, or add a
              linked company under Settings → Company accounts.
            </p>
          ) : (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Copy from
                </label>
                <select
                  className={selectClassName}
                  value={sourceCompanyId}
                  onChange={(e) => setSourceCompanyId(e.target.value)}
                >
                  <option value="">Select company</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </div>

              {sourceCompanyId ? (
                loading ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading employees…
                  </p>
                ) : employees.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No employees on that company.</p>
                ) : (
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={allSelectableChecked}
                        onCheckedChange={(checked) => {
                          setSelectedIds(checked ? selectable.map((row) => row.id) : []);
                        }}
                      />
                      Select all who aren’t already here
                    </label>
                    <ul className="divide-y rounded-md border">
                      {employees.map((employee) => {
                        const disabled = employee.match === "linked";
                        const checked = selectedIds.includes(employee.id);
                        return (
                          <li key={employee.id}>
                            <label
                              className={`flex items-start gap-2 px-3 py-2 text-sm ${
                                disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                              }`}
                            >
                              <Checkbox
                                className="mt-0.5"
                                checked={checked}
                                disabled={disabled}
                                onCheckedChange={(value) => toggle(employee.id, Boolean(value))}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-medium">{employee.name}</span>
                                  <Badge variant="secondary">
                                    {ROLE_LABELS[employee.role as UserRole] ?? employee.role}
                                  </Badge>
                                  {employee.match === "linked" ? (
                                    <Badge variant="outline">Already here</Badge>
                                  ) : employee.match === "exists" ? (
                                    <Badge variant="outline">Same email — will link</Badge>
                                  ) : null}
                                  {employee.status !== "ACTIVE" ? (
                                    <Badge variant="outline">Archived</Badge>
                                  ) : null}
                                </span>
                                <span className="block text-xs text-muted-foreground">
                                  {employee.email}
                                </span>
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )
              ) : null}
            </>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t px-4 py-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={saving || selectedIds.length === 0}
            onClick={() => void submit()}
          >
            {saving ? "Copying…" : `Copy ${selectedIds.length} selected`}
          </Button>
        </div>
      </div>
    </div>
  );
}
