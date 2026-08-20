"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { POLICY_CATEGORIES } from "@/lib/storm-ai/policies-shared";
import { cn } from "@/lib/utils";

type Policy = {
  id: string;
  title: string;
  category: string | null;
  description: string;
  active: boolean;
  sortOrder: number;
};

const UNCATEGORIZED = "Uncategorized";

function categoryLabel(category: string | null) {
  return category?.trim() || UNCATEGORIZED;
}

function csvEscape(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function policiesToCsv(rows: Policy[]) {
  const header = ["Title", "Category", "Active", "Sort order", "Description"];
  const lines = [header.join(",")];
  const sorted = [...rows].sort(
    (a, b) =>
      categoryLabel(a.category).localeCompare(categoryLabel(b.category)) ||
      a.sortOrder - b.sortOrder ||
      a.title.localeCompare(b.title)
  );
  for (const policy of sorted) {
    lines.push(
      [
        csvEscape(policy.title),
        csvEscape(categoryLabel(policy.category)),
        policy.active ? "yes" : "no",
        String(policy.sortOrder),
        csvEscape(policy.description),
      ].join(",")
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}

export default function StormAiPoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Policy | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const groups = useMemo(() => {
    const known = new Set<string>(POLICY_CATEGORIES);
    const byCategory = new Map<string, Policy[]>();

    for (const category of POLICY_CATEGORIES) {
      byCategory.set(category, []);
    }
    byCategory.set(UNCATEGORIZED, []);

    for (const policy of policies) {
      const label = categoryLabel(policy.category);
      if (!byCategory.has(label)) byCategory.set(label, []);
      byCategory.get(label)!.push(policy);
    }

    for (const rows of byCategory.values()) {
      rows.sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
    }

    const ordered: Array<{ label: string; policies: Policy[] }> = [];
    for (const category of POLICY_CATEGORIES) {
      ordered.push({ label: category, policies: byCategory.get(category) ?? [] });
    }

    const extras = [...byCategory.keys()]
      .filter((label) => label !== UNCATEGORIZED && !known.has(label))
      .sort((a, b) => a.localeCompare(b));
    for (const label of extras) {
      ordered.push({ label, policies: byCategory.get(label) ?? [] });
    }

    const uncategorized = byCategory.get(UNCATEGORIZED) ?? [];
    if (uncategorized.length > 0) {
      ordered.push({ label: UNCATEGORIZED, policies: uncategorized });
    }

    return ordered;
  }, [policies]);

  async function load() {
    const res = await fetch("/api/settings/storm-ai/policies");
    if (!res.ok) throw new Error("load");
    const data = await res.json();
    const next = (data.policies ?? []) as Policy[];
    setPolicies(next);
    setSelectedId((current) => current ?? next[0]?.id ?? null);
  }

  useEffect(() => {
    void load()
      .catch(() => toast.error("Could not load company policies"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const policy = policies.find((row) => row.id === selectedId) ?? null;
    setDraft((prev) => {
      if (!policy) return null;
      if (prev?.id === policy.id) {
        return {
          ...policy,
          title: prev.title,
          category: prev.category,
          description: prev.description,
          active: prev.active,
        };
      }
      return policy;
    });
  }, [policies, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const selected = policies.find((row) => row.id === selectedId);
    if (!selected) return;
    const label = categoryLabel(selected.category);
    setOpenGroups((prev) => (prev[label] ? prev : { ...prev, [label]: true }));
  }, [policies, selectedId]);

  function toggleGroup(label: string) {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  async function createPolicy() {
    const title = newTitle.trim();
    if (!title) return;
    try {
      const res = await fetch("/api/settings/storm-ai/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error("create");
      const created = (await res.json()) as Policy;
      setNewTitle("");
      await load();
      setSelectedId(created.id);
      setOpenGroups((prev) => ({ ...prev, [UNCATEGORIZED]: true }));
    } catch {
      toast.error("Could not add policy");
    }
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/settings/storm-ai/policies/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          category: draft.category,
          description: draft.description,
          active: draft.active,
        }),
      });
      if (!res.ok) throw new Error("save");
      toast.success("Saved");
      await load();
      if (draft.category) {
        setOpenGroups((prev) => ({ ...prev, [draft.category!]: true }));
      }
    } catch {
      toast.error("Could not save policy");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this company policy?")) return;
    const res = await fetch(`/api/settings/storm-ai/policies/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not delete");
      return;
    }
    if (selectedId === id) setSelectedId(null);
    toast.success("Deleted");
    await load();
  }

  async function moveWithinGroup(id: string, direction: -1 | 1) {
    const policy = policies.find((row) => row.id === id);
    if (!policy) return;
    const label = categoryLabel(policy.category);
    const group = groups.find((row) => row.label === label)?.policies ?? [];
    const index = group.findIndex((row) => row.id === id);
    const swap = group[index + direction];
    if (index < 0 || !swap) return;
    await Promise.all([
      fetch(`/api/settings/storm-ai/policies/${policy.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: swap.sortOrder }),
      }),
      fetch(`/api/settings/storm-ai/policies/${swap.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: policy.sortOrder }),
      }),
    ]);
    await load();
  }

  function exportCsv() {
    if (!policies.length) {
      toast.error("No policies to export");
      return;
    }
    const csv = policiesToCsv(policies);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 10);
    const link = document.createElement("a");
    link.href = url;
    link.download = `storm-ai-company-policies-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success("Policies exported");
  }

  return (
    <ContentArea className="max-w-5xl">
      <PageHeader
        breadcrumb={["Settings", "Storm AI", "Company policies"]}
        title="Company policies"
        subtitle="Tell Storm AI how this company handles safety, property protection, technical standards, customer authorization, pricing/payments, and employee operations. Storm AI checks these before it answers."
        actions={
          <Button
            type="button"
            variant="outline"
            onClick={exportCsv}
            disabled={loading || policies.length === 0}
          >
            Export CSV
          </Button>
        }
      />

      <div className="mb-4 flex gap-2">
        <Input
          placeholder="New policy title, e.g. Mark sprinkler lines before dig"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void createPolicy();
          }}
        />
        <Button onClick={() => void createPolicy()} disabled={!newTitle.trim()}>
          Add policy
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
          <div className="space-y-2">
            {policies.length === 0 ? (
              <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
                No policies yet.
              </p>
            ) : (
              groups.map((group) => {
                const open = Boolean(openGroups[group.label]);
                return (
                  <div
                    key={group.label}
                    className="overflow-hidden rounded-lg border border-border bg-card"
                  >
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium hover:bg-muted/40"
                      aria-expanded={open}
                      onClick={() => toggleGroup(group.label)}
                    >
                      <span className="min-w-0 truncate">{group.label}</span>
                      <span className="flex shrink-0 items-center gap-2 text-xs font-normal text-muted-foreground">
                        {group.policies.length}
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 transition-transform",
                            open && "rotate-180"
                          )}
                        />
                      </span>
                    </button>
                    {open ? (
                      group.policies.length === 0 ? (
                        <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                          No policies in this category yet.
                        </p>
                      ) : (
                        <ul className="divide-y border-t border-border">
                          {group.policies.map((policy, index) => (
                            <li key={policy.id}>
                              <button
                                type="button"
                                onClick={() => setSelectedId(policy.id)}
                                className={cn(
                                  "flex w-full items-start justify-between gap-2 px-3 py-2.5 text-left text-sm",
                                  policy.id === selectedId
                                    ? "bg-muted/60"
                                    : "hover:bg-muted/40"
                                )}
                              >
                                <span className="min-w-0">
                                  <span className="block font-medium">{policy.title}</span>
                                  {!policy.active ? (
                                    <span className="block text-xs text-muted-foreground">
                                      inactive
                                    </span>
                                  ) : null}
                                </span>
                                <span className="flex shrink-0 gap-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={index === 0}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void moveWithinGroup(policy.id, -1);
                                    }}
                                  >
                                    Up
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={index === group.policies.length - 1}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void moveWithinGroup(policy.id, 1);
                                    }}
                                  >
                                    Down
                                  </Button>
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          {draft ? (
            <section className="space-y-4 rounded-lg border border-border bg-card p-4">
              <div>
                <label className="text-sm font-medium">Title</label>
                <Input
                  className="mt-1"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Category</label>
                <select
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={draft.category ?? ""}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value || null })}
                >
                  <option value="">Uncategorized</option>
                  {draft.category &&
                  !(POLICY_CATEGORIES as readonly string[]).includes(draft.category) ? (
                    <option value={draft.category}>{draft.category} (current)</option>
                  ) : null}
                  {POLICY_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Policy</label>
                <textarea
                  className="mt-1 min-h-[220px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  placeholder="Describe exactly how the company wants this handled. Storm AI will follow this wording."
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={draft.active}
                    onCheckedChange={(active) => setDraft({ ...draft, active })}
                  />
                  <span className="text-sm">Active — Storm AI can use this policy</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => void remove(draft.id)}>
                    Delete
                  </Button>
                  <Button onClick={() => void save()} disabled={saving || !draft.title.trim()}>
                    {saving ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
            </section>
          ) : (
            <p className="text-sm text-muted-foreground">
              Add a policy to teach Storm AI how this company does things.
            </p>
          )}
        </div>
      )}
    </ContentArea>
  );
}
