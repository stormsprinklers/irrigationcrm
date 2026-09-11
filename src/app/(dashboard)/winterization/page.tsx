"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { useWinterizationTab } from "@/components/layout/CompanyBrandProvider";
import { AddToWinterizationListDialog } from "@/components/winterization/AddToWinterizationListDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPhoneDisplay } from "@/lib/inbox/phone";
import { cn } from "@/lib/utils";
import { winterizationSeasonTag } from "@/lib/winterization/weeks";
import type { WinterizationWeek } from "@/lib/winterization/weeks";

const NO_CITY = "__none__";

type Row = {
  id: string;
  status: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  zip: string | null;
  zoneCount: number | null;
  quotedPrice: number | null;
  weekLabel: string | null;
  scheduledDate: string | null;
  schedulingNotes: string | null;
  shutoffValveLocation: string | null;
  timerLocation: string | null;
  customerId: string | null;
  createdAt: string;
};

function cityKey(city: string | null | undefined) {
  const value = city?.trim();
  return value ? value.toLowerCase() : NO_CITY;
}

function formatDay(iso: string | null) {
  if (!iso) return null;
  try {
    return format(parseISO(iso.slice(0, 10)), "MMM d, yyyy");
  } catch {
    return iso;
  }
}

const notesClassName =
  "flex min-h-[4.5rem] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function WinterizationNotesCell({
  row,
  onSaved,
}: {
  row: Row;
  onSaved: (id: string, schedulingNotes: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.schedulingNotes ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(row.schedulingNotes ?? "");
  }, [editing, row.schedulingNotes]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/winterization/requests/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedulingNotes: draft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Could not save notes");
      }
      onSaved(row.id, typeof data.schedulingNotes === "string" ? data.schedulingNotes : draft.trim() || null);
      setEditing(false);
      toast.success("Notes saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save notes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <TableCell className="max-w-xs text-xs text-muted-foreground">
      {row.shutoffValveLocation ? <div>Valve: {row.shutoffValveLocation}</div> : null}
      {row.timerLocation ? <div>Timer: {row.timerLocation}</div> : null}
      {editing ? (
        <form
          className="mt-1 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <textarea
            autoFocus
            className={notesClassName}
            placeholder="Add a note for the office or tech…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={saving}
          />
          <div className="flex flex-wrap gap-1">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={saving}
              onClick={() => {
                setDraft(row.schedulingNotes ?? "");
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-0.5 flex items-start gap-1">
          <div className="min-w-0 flex-1 whitespace-pre-wrap">
            {row.schedulingNotes ? (
              row.schedulingNotes
            ) : (
              <span className="italic">No notes</span>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground"
            aria-label={`Edit notes for ${row.name}`}
            onClick={() => setEditing(true)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </TableCell>
  );
}

export default function WinterizationListPage() {
  const { enabled } = useWinterizationTab();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("NEED_BOOKING");
  const [weeks, setWeeks] = useState<WinterizationWeek[]>([]);
  const [seasonTag, setSeasonTag] = useState(() => winterizationSeasonTag());
  const [addOpen, setAddOpen] = useState(false);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [scheduleDate, setScheduleDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [pendingRemoveIds, setPendingRemoveIds] = useState<string[]>([]);

  function load() {
    setLoading(true);
    fetch(`/api/winterization/requests?status=${encodeURIComponent(status)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        setRows(data.requests ?? []);
        setWeeks(data.weeks ?? []);
        if (typeof data.seasonTag === "string" && data.seasonTag) {
          setSeasonTag(data.seasonTag);
        }
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setSelectedIds([]);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, status]);

  const cities = useMemo(() => {
    const labels = new Map<string, string>();
    let hasNone = false;
    for (const row of rows) {
      const key = cityKey(row.city);
      if (key === NO_CITY) {
        hasNone = true;
        continue;
      }
      if (!labels.has(key)) labels.set(key, row.city!.trim());
    }
    const listed = [...labels.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([key, label]) => ({ key, label }));
    return hasNone ? [...listed, { key: NO_CITY, label: "No city" }] : listed;
  }, [rows]);

  const visibleRows = useMemo(() => {
    if (selectedCities.length === 0) return rows;
    const allowed = new Set(selectedCities);
    return rows.filter((row) => allowed.has(cityKey(row.city)));
  }, [rows, selectedCities]);

  const visibleIds = useMemo(() => visibleRows.map((row) => row.id), [visibleRows]);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.includes(id));
  const selectedCount = selectedIds.length;

  function toggleCity(key: string) {
    setSelectedCities((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    );
  }

  function toggleRow(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((item) => item !== id);
    });
  }

  function toggleAllVisible(checked: boolean) {
    if (checked) {
      setSelectedIds((prev) => [...new Set([...prev, ...visibleIds])]);
      return;
    }
    const drop = new Set(visibleIds);
    setSelectedIds((prev) => prev.filter((id) => !drop.has(id)));
  }

  async function runBatch(action: "schedule" | "remove", ids = selectedIds) {
    if (!ids.length) {
      toast.error("Select at least one customer");
      return;
    }
    if (action === "schedule" && !scheduleDate) {
      toast.error("Choose a day to schedule");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/winterization/requests/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ids,
          scheduledDate: action === "schedule" ? scheduleDate : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Could not update");
      }
      const count = Number(data.updated ?? ids.length);
      if (action === "schedule") {
        toast.success(
          `Scheduled ${count} for ${formatDay(scheduleDate) ?? scheduleDate}`
        );
      } else {
        toast.success(`Removed ${count} from the list`);
      }
      setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
      setPendingRemoveIds([]);
      setRemoveOpen(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update");
    } finally {
      setBusy(false);
    }
  }

  async function scheduleOne(id: string) {
    if (!scheduleDate) {
      toast.error("Choose a day above, then schedule");
      setSelectedIds([id]);
      return;
    }
    setSelectedIds([id]);
    setBusy(true);
    try {
      const res = await fetch(`/api/winterization/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "SCHEDULED", scheduledDate: scheduleDate }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Could not schedule");
      }
      toast.success(`Scheduled for ${formatDay(scheduleDate)}`);
      setSelectedIds([]);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not schedule");
    } finally {
      setBusy(false);
    }
  }

  if (!enabled) {
    return (
      <ContentArea className="max-w-2xl">
        <PageHeader title="Winterization" />
        <p className="text-sm text-muted-foreground">
          This list is hidden right now. Irrigation companies can turn it on or set a seasonal
          window under{" "}
          <Link href="/settings" className="text-primary underline">
            Settings → Company → Industry features
          </Link>
          .
        </p>
      </ContentArea>
    );
  }

  return (
    <ContentArea className="max-w-6xl">
      <PageHeader
        title="Winterization"
        subtitle={`Customers who want a blow-out this season. Everyone on this list is tagged ${seasonTag} so campaigns can skip them.`}
        actions={
          <Button type="button" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Add to list
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          { id: "NEED_BOOKING", label: "Need booking" },
          { id: "SCHEDULED", label: "Scheduled" },
          { id: "ALL", label: "All open" },
        ].map((option) => (
          <Button
            key={option.id}
            type="button"
            size="sm"
            variant={status === option.id ? "default" : "outline"}
            onClick={() => setStatus(option.id)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {cities.length > 0 ? (
        <div className="mb-4">
          <p className="mb-2 text-sm font-medium">Filter by city</p>
          <div className="flex flex-wrap gap-2">
            {cities.map((city) => {
              const on = selectedCities.includes(city.key);
              return (
                <button
                  key={city.key}
                  type="button"
                  onClick={() => toggleCity(city.key)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground hover:bg-muted"
                  )}
                >
                  {city.label}
                </button>
              );
            })}
            {selectedCities.length > 0 ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedCities([])}>
                Clear cities
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/30 p-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Schedule selected for</label>
          <Input
            type="date"
            className="mt-1 w-[11.5rem]"
            value={scheduleDate}
            onChange={(e) => setScheduleDate(e.target.value)}
          />
        </div>
        <Button
          type="button"
          size="sm"
          disabled={busy || selectedCount === 0 || !scheduleDate}
          onClick={() => void runBatch("schedule")}
        >
          Schedule {selectedCount || ""} selected
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || selectedCount === 0}
          onClick={() => {
            setPendingRemoveIds(selectedIds);
            setRemoveOpen(true);
          }}
        >
          Remove selected
        </Button>
        <p className="text-xs text-muted-foreground">
          {selectedCount === 0
            ? "Select customers, then pick a day or remove them from the list."
            : `${selectedCount} selected`}
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : visibleRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No winterization requests in this view.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                  onCheckedChange={(value) => toggleAllVisible(value === true)}
                  aria-label="Select all visible"
                />
              </TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Week / day</TableHead>
              <TableHead>Zones</TableHead>
              <TableHead>Quote</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((row) => {
              const checked = selectedIds.includes(row.id);
              return (
                <TableRow key={row.id} data-state={checked ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) => toggleRow(row.id, value === true)}
                      aria-label={`Select ${row.name}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">
                      {row.customerId ? (
                        <Link className="text-primary hover:underline" href={`/customers/${row.customerId}`}>
                          {row.name}
                        </Link>
                      ) : (
                        row.name
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {row.phone ? (
                        <a className="hover:underline" href={`tel:${row.phone}`}>
                          {formatPhoneDisplay(row.phone)}
                        </a>
                      ) : null}
                    </div>
                    {row.address ? (
                      <div className="text-xs text-muted-foreground">{row.address}</div>
                    ) : null}
                  </TableCell>
                  <TableCell>{row.city || "—"}</TableCell>
                  <TableCell>
                    <div>{row.weekLabel || "No week yet"}</div>
                    {row.scheduledDate ? (
                      <div className="text-xs font-medium text-primary">
                        {formatDay(row.scheduledDate)}
                      </div>
                    ) : null}
                    <Badge variant="outline" className="mt-1">
                      {row.status === "NEED_BOOKING" ? "Needs date" : row.status.toLowerCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>{row.zoneCount ?? "—"}</TableCell>
                  <TableCell>{row.quotedPrice != null ? `$${row.quotedPrice}` : "—"}</TableCell>
                  <WinterizationNotesCell
                    row={row}
                    onSaved={(id, schedulingNotes) => {
                      setRows((current) =>
                        current.map((item) => (item.id === id ? { ...item, schedulingNotes } : item))
                      );
                    }}
                  />
                  <TableCell className="whitespace-nowrap text-right">
                    {row.status === "NEED_BOOKING" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void scheduleOne(row.id)}
                      >
                        Schedule
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={busy}
                      onClick={() => {
                        setPendingRemoveIds([row.id]);
                        setRemoveOpen(true);
                      }}
                    >
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <AddToWinterizationListDialog
        open={addOpen}
        weeks={weeks}
        seasonTag={seasonTag}
        onClose={() => setAddOpen(false)}
        onAdded={load}
      />
      <ConfirmDialog
        open={removeOpen}
        title={pendingRemoveIds.length > 1 ? "Remove from winterization list?" : "Remove this customer?"}
        description={
          pendingRemoveIds.length > 1
            ? `This removes ${pendingRemoveIds.length} people from the list and takes off the ${seasonTag} tag so they can be included in winterization campaigns again.`
            : `This removes them from the list and takes off the ${seasonTag} tag so they can be included in winterization campaigns again.`
        }
        confirmLabel="Remove"
        confirmVariant="destructive"
        busy={busy}
        onCancel={() => {
          setRemoveOpen(false);
          setPendingRemoveIds([]);
        }}
        onConfirm={() => void runBatch("remove", pendingRemoveIds)}
      />
    </ContentArea>
  );
}
