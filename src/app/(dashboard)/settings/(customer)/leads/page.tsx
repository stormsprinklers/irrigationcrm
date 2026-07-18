"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, Loader2, Phone, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useCompanySettings } from "@/components/settings/useCompanySettings";
import type { CompanySettingsDTO } from "@/lib/company/types";

type PhoneNumberRow = {
  id: string;
  e164: string;
  friendlyName: string | null;
  numberType: string;
  isPrimary: boolean;
  trackingSource: string | null;
};

function formatPhone(e164: string) {
  const digits = e164.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return e164;
}

export default function SettingsLeadSourcesPage() {
  const { company, setCompany, loading, saving, save } = useCompanySettings();
  const [newSource, setNewSource] = useState("");
  const [numbers, setNumbers] = useState<PhoneNumberRow[]>([]);
  const [numbersLoading, setNumbersLoading] = useState(true);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const loadNumbers = useCallback(async () => {
    setNumbersLoading(true);
    try {
      const res = await fetch("/api/settings/voice/numbers");
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to load phone numbers");
        setNumbers([]);
        return;
      }
      setNumbers(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load phone numbers");
    } finally {
      setNumbersLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNumbers();
  }, [loadNumbers]);

  const activeSources = company?.leadSources ?? [];
  const archivedSources = company?.archivedLeadSources ?? [];

  const numbersBySource = useMemo(() => {
    const map = new Map<string, PhoneNumberRow[]>();
    for (const source of [...activeSources, ...archivedSources]) {
      map.set(source, []);
    }
    for (const number of numbers) {
      const key = number.trackingSource?.trim();
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(number);
      map.set(key, list);
    }
    return map;
  }, [numbers, activeSources, archivedSources]);

  async function persistSources(next: Partial<CompanySettingsDTO>) {
    if (!company) return;
    const updated = { ...company, ...next };
    setCompany(updated);
    await save(updated);
  }

  async function addSource() {
    const name = newSource.trim();
    if (!company || !name) return;
    if (activeSources.includes(name) || archivedSources.includes(name)) {
      toast.error("That lead source already exists");
      return;
    }
    setNewSource("");
    await persistSources({
      leadSources: [...activeSources, name],
      archivedLeadSources: archivedSources.filter((s) => s !== name),
    });
    toast.success("Lead source added");
  }

  async function archiveSource(source: string) {
    if (!company) return;
    await persistSources({
      leadSources: activeSources.filter((s) => s !== source),
      archivedLeadSources: archivedSources.includes(source)
        ? archivedSources
        : [...archivedSources, source],
    });
    toast.success(`Archived “${source}”`);
  }

  async function unarchiveSource(source: string) {
    if (!company) return;
    await persistSources({
      archivedLeadSources: archivedSources.filter((s) => s !== source),
      leadSources: activeSources.includes(source) ? activeSources : [...activeSources, source],
    });
    toast.success(`Restored “${source}”`);
  }

  async function removeSource(source: string, from: "active" | "archived") {
    if (!company) return;
    const assigned = numbers.filter((n) => n.trackingSource?.trim() === source);
    const message =
      assigned.length > 0
        ? `Remove “${source}”? ${assigned.length} tracking number${assigned.length === 1 ? "" : "s"} will be unassigned from this source.`
        : `Remove “${source}” permanently?`;
    if (!confirm(message)) return;

    for (const number of assigned) {
      await fetch(`/api/settings/voice/numbers/${number.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackingSource: null }),
      });
    }

    await persistSources({
      leadSources: from === "active" ? activeSources.filter((s) => s !== source) : activeSources,
      archivedLeadSources:
        from === "archived" ? archivedSources.filter((s) => s !== source) : archivedSources,
    });
    await loadNumbers();
    toast.success(`Removed “${source}”`);
  }

  async function setNumberSource(numberId: string, source: string | null) {
    setAssigningId(numberId);
    try {
      const res = await fetch(`/api/settings/voice/numbers/${numberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackingSource: source }),
      });
      if (!res.ok) {
        toast.error("Failed to update tracking number");
        return;
      }
      const updated = (await res.json()) as PhoneNumberRow;
      setNumbers((prev) => prev.map((n) => (n.id === numberId ? { ...n, ...updated } : n)));
    } finally {
      setAssigningId(null);
    }
  }

  async function toggleNumberForSource(source: string, number: PhoneNumberRow, checked: boolean) {
    const nextSource = checked ? source : null;
    // If assigning, clear from another source implicitly by setting trackingSource.
    await setNumberSource(number.id, nextSource);
  }

  if (loading || !company) {
    return (
      <ContentArea className="max-w-3xl">
        <PageHeader breadcrumb={["Settings", "Lead Sources"]} title="Lead Sources" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </ContentArea>
    );
  }

  const trackingNumbers = numbers.filter(
    (n) => n.numberType === "TRACKING" || n.numberType === "PRIMARY" || !n.numberType
  );

  return (
    <ContentArea className="max-w-3xl">
      <PageHeader
        breadcrumb={["Settings", "Customer", "Lead Sources"]}
        title="Lead Sources"
        subtitle="Manage sources for attribution and assign tracking phone numbers"
        actions={
          <Button size="sm" onClick={() => save(company)} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2 rounded-lg border border-border bg-white p-4">
        <Input
          className="min-w-[200px] flex-1"
          value={newSource}
          onChange={(e) => setNewSource(e.target.value)}
          placeholder="New lead source (e.g. Google Ads, Yard sign)"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void addSource();
            }
          }}
        />
        <Button onClick={() => void addSource()} disabled={!newSource.trim() || saving}>
          <Plus className="mr-1 h-4 w-4" />
          Add source
        </Button>
      </div>

      <div className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Active sources
        </h2>
        {activeSources.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-white p-6 text-sm text-muted-foreground">
            No active lead sources yet. Add one above.
          </p>
        ) : (
          activeSources.map((source) => {
            const assigned = numbersBySource.get(source) ?? [];
            return (
              <div key={source} className="rounded-lg border border-border bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{source}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {assigned.length === 0
                        ? "No tracking numbers assigned"
                        : `${assigned.length} tracking number${assigned.length === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void archiveSource(source)}
                      disabled={saving}
                    >
                      <Archive className="mr-1 h-3.5 w-3.5" />
                      Archive
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void removeSource(source, "active")}
                      disabled={saving}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Remove
                    </Button>
                  </div>
                </div>

                <div className="mt-4 border-t border-border pt-3">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" />
                    Tracking numbers
                  </p>
                  {numbersLoading ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading numbers…
                    </p>
                  ) : trackingNumbers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No phone numbers yet. Add them under Communications → Phone numbers.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {trackingNumbers.map((number) => {
                        const checked = number.trackingSource?.trim() === source;
                        const otherSource =
                          number.trackingSource?.trim() &&
                          number.trackingSource.trim() !== source
                            ? number.trackingSource.trim()
                            : null;
                        return (
                          <li key={number.id}>
                            <label className="flex cursor-pointer items-start gap-2 text-sm">
                              <Checkbox
                                className="mt-0.5"
                                checked={checked}
                                disabled={assigningId === number.id}
                                onCheckedChange={(value) =>
                                  void toggleNumberForSource(source, number, value === true)
                                }
                              />
                              <span className="min-w-0">
                                <span className="font-medium">
                                  {number.friendlyName || formatPhone(number.e164)}
                                </span>
                                <span className="text-muted-foreground">
                                  {" "}
                                  · {formatPhone(number.e164)}
                                </span>
                                {number.isPrimary ? (
                                  <Badge variant="outline" className="ml-2 text-[10px]">
                                    Primary
                                  </Badge>
                                ) : null}
                                {otherSource ? (
                                  <span className="mt-0.5 block text-xs text-amber-700">
                                    Currently assigned to “{otherSource}” — checking this will
                                    move it here.
                                  </span>
                                ) : null}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {archivedSources.length > 0 ? (
        <div className="mt-8 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Archived sources
          </h2>
          {archivedSources.map((source) => (
            <div
              key={source}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-4"
            >
              <div>
                <p className="font-medium text-muted-foreground">{source}</p>
                <p className="text-xs text-muted-foreground">
                  {(numbersBySource.get(source) ?? []).length > 0
                    ? `${(numbersBySource.get(source) ?? []).length} number(s) still tagged — attributions keep working`
                    : "Hidden from new lead pickers"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void unarchiveSource(source)}
                  disabled={saving}
                >
                  <ArchiveRestore className="mr-1 h-3.5 w-3.5" />
                  Restore
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void removeSource(source, "archived")}
                  disabled={saving}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-8 space-y-4 rounded-lg border border-border bg-white p-6">
        <h2 className="font-medium">Lead intake defaults</h2>
        <div>
          <label className="text-sm text-muted-foreground">Default assignee user ID</label>
          <Input
            className="mt-1"
            value={company.defaultLeadAssigneeId ?? ""}
            onChange={(e) =>
              setCompany({ ...company, defaultLeadAssigneeId: e.target.value || null })
            }
            placeholder="Optional user ID"
          />
        </div>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            className="mt-0.5"
            checked={company.notifyLeadCreated ?? true}
            onCheckedChange={(checked) =>
              setCompany({ ...company, notifyLeadCreated: checked === true })
            }
          />
          <span>
            Email the company support/contact address when a new website lead arrives (not
            individual salesperson or staff inboxes)
          </span>
        </label>
      </div>
    </ContentArea>
  );
}
