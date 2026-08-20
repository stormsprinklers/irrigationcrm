"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { POLICY_CATEGORIES } from "@/lib/storm-ai/policies-shared";

type Policy = {
  id: string;
  title: string;
  category: string | null;
  description: string;
  active: boolean;
  sortOrder: number;
};

export default function StormAiPoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Policy | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

  async function move(id: string, direction: -1 | 1) {
    const index = policies.findIndex((row) => row.id === id);
    const swap = policies[index + direction];
    if (index < 0 || !swap) return;
    await Promise.all([
      fetch(`/api/settings/storm-ai/policies/${policies[index]!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: swap.sortOrder }),
      }),
      fetch(`/api/settings/storm-ai/policies/${swap.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: policies[index]!.sortOrder }),
      }),
    ]);
    await load();
  }

  return (
    <ContentArea className="max-w-5xl">
      <PageHeader
        breadcrumb={["Settings", "Storm AI", "Company policies"]}
        title="Company policies"
        subtitle="Tell Storm AI how this company handles safety, property protection, technical standards, customer authorization, pricing/payments, and employee operations. Storm AI checks these before it answers."
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
        <div className="grid gap-4 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
          <ul className="divide-y rounded-lg border border-border bg-card">
            {policies.length === 0 ? (
              <li className="p-4 text-sm text-muted-foreground">No policies yet.</li>
            ) : (
              policies.map((policy, index) => (
                <li key={policy.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(policy.id)}
                    className={`flex w-full items-start justify-between gap-2 px-3 py-3 text-left text-sm ${
                      policy.id === selectedId ? "bg-muted/60" : "hover:bg-muted/40"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block font-medium">{policy.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {policy.category || "Uncategorized"}
                        {policy.active ? "" : " · inactive"}
                      </span>
                    </span>
                    <span className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={index === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          void move(policy.id, -1);
                        }}
                      >
                        Up
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={index === policies.length - 1}
                        onClick={(e) => {
                          e.stopPropagation();
                          void move(policy.id, 1);
                        }}
                      >
                        Down
                      </Button>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>

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
                  {/* Keep any legacy category still stored on this policy so editing does not clear it. */}
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
