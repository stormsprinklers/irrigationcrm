"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import { BellRing, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  IMPORTANT_UPDATE_COLORS,
  type ImportantUpdateColor,
  type ImportantUpdateDTO,
} from "@/lib/home/important-update-types";
import { canUseOfficeTodos } from "@/lib/home/todo-types";

const updateColorStyles: Record<ImportantUpdateColor, { label: string; card: string; swatch: string }> = {
  AMBER: {
    label: "Amber",
    card: "border-amber-300 bg-amber-50/80 shadow-[0_0_18px_rgba(245,158,11,0.28)]",
    swatch: "bg-amber-400",
  },
  ROSE: {
    label: "Rose",
    card: "border-rose-300 bg-rose-50/80 shadow-[0_0_18px_rgba(244,63,94,0.25)]",
    swatch: "bg-rose-400",
  },
  SKY: {
    label: "Sky",
    card: "border-sky-300 bg-sky-50/80 shadow-[0_0_18px_rgba(14,165,233,0.24)]",
    swatch: "bg-sky-400",
  },
  VIOLET: {
    label: "Violet",
    card: "border-violet-300 bg-violet-50/80 shadow-[0_0_18px_rgba(139,92,246,0.24)]",
    swatch: "bg-violet-400",
  },
  EMERALD: {
    label: "Emerald",
    card: "border-emerald-300 bg-emerald-50/80 shadow-[0_0_18px_rgba(16,185,129,0.24)]",
    swatch: "bg-emerald-400",
  },
};

type Draft = { title: string; body: string; color: ImportantUpdateColor };
const blankDraft = (): Draft => ({ title: "", body: "", color: "AMBER" });

export function ImportantUpdatesPanel({ className }: { className?: string }) {
  const { data: session } = useSession();
  const allowed = canUseOfficeTodos(session?.user?.role ?? "");
  const [updates, setUpdates] = useState<ImportantUpdateDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/home/important-updates");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load important updates");
    setUpdates(data.updates ?? []);
  }, []);

  useEffect(() => {
    if (!allowed) return;
    setLoading(true);
    load()
      .catch((error) => toast.error(error instanceof Error ? error.message : "Failed to load important updates"))
      .finally(() => setLoading(false));
  }, [allowed, load]);

  function resetEditor() {
    setAdding(false);
    setEditingId(null);
    setDraft(blankDraft());
  }

  function beginEdit(update: ImportantUpdateDTO) {
    setAdding(false);
    setEditingId(update.id);
    setDraft({ title: update.title, body: update.body ?? "", color: update.color });
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.title.trim()) {
      toast.error("Enter an update title");
      return;
    }
    setSaving(true);
    try {
      const endpoint = editingId
        ? `/api/home/important-updates/${editingId}`
        : "/api/home/important-updates";
      const res = await fetch(endpoint, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save important update");
      setUpdates((current) =>
        editingId
          ? current.map((update) => (update.id === editingId ? (data as ImportantUpdateDTO) : update))
          : [data as ImportantUpdateDTO, ...current]
      );
      resetEditor();
      toast.success(editingId ? "Important update saved" : "Important update posted for one week");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save important update");
    } finally {
      setSaving(false);
    }
  }

  async function remove(update: ImportantUpdateDTO) {
    if (!window.confirm(`Delete “${update.title}”?`)) return;
    setBusyId(update.id);
    try {
      const res = await fetch(`/api/home/important-updates/${update.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to delete important update");
      setUpdates((current) => current.filter((item) => item.id !== update.id));
      if (editingId === update.id) resetEditor();
      toast.success("Important update deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete important update");
    } finally {
      setBusyId(null);
    }
  }

  if (!allowed) return null;

  return (
    <Card className={cn("mb-6 h-fit", className)}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <BellRing className="h-5 w-5 text-amber-600" />
            <CardTitle className="text-base font-semibold">Important updates</CardTitle>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Shared notices for the office. Each one expires automatically after one week.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => {
          resetEditor();
          setAdding(true);
        }}>
          <Plus className="mr-1 h-4 w-4" />
          Add update
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {adding || editingId ? (
          <form onSubmit={(event) => void save(event)} className="space-y-3 rounded-md border border-dashed border-border p-3">
            <Input
              autoFocus
              value={draft.title}
              maxLength={140}
              placeholder="What does the team need to know?"
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            />
            <textarea
              rows={3}
              value={draft.body}
              maxLength={2_000}
              placeholder="Details (optional)"
              className="min-h-[76px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2" aria-label="Update color">
                {IMPORTANT_UPDATE_COLORS.map((color) => {
                  const style = updateColorStyles[color];
                  const selected = draft.color === color;
                  return (
                    <button
                      key={color}
                      type="button"
                      title={style.label}
                      aria-label={`${style.label} update color`}
                      aria-pressed={selected}
                      className={cn(
                        "h-6 w-6 rounded-full ring-offset-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        style.swatch,
                        selected && "ring-2 ring-foreground"
                      )}
                      onClick={() => setDraft((current) => ({ ...current, color }))}
                    />
                  );
                })}
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? "Saving..." : editingId ? "Save" : "Post update"}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={resetEditor} disabled={saving}>
                  <X className="mr-1 h-3.5 w-3.5" />
                  Cancel
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Editing does not extend the seven-day expiration.</p>
          </form>
        ) : null}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading updates...</p>
        ) : updates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No important updates right now.</p>
        ) : (
          <div className="space-y-3">
            {updates.map((update) => {
              const style = updateColorStyles[update.color];
              return (
                <article key={update.id} className={cn("rounded-lg border p-3", style.card)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold">{update.title}</h3>
                      {update.body ? <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/85">{update.body}</p> : null}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button type="button" variant="ghost" size="icon" aria-label={`Edit ${update.title}`} onClick={() => beginEdit(update)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" aria-label={`Delete ${update.title}`} disabled={busyId === update.id} onClick={() => void remove(update)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-foreground/65">
                    Posted by {update.createdByName} · Expires {format(new Date(update.expiresAt), "MMM d, h:mm a")}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
