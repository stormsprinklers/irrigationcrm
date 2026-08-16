"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Issue = {
  id: string;
  name: string;
  trigger: string;
  active: boolean;
  nodeCount: number;
  sortOrder: number;
};

export default function TechAssistantIssuesPage() {
  const router = useRouter();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    const res = await fetch("/api/settings/storm-ai/issues");
    if (!res.ok) {
      toast.error("Could not load workflows");
      return;
    }
    const data = await res.json();
    setIssues(data.issues ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function createIssue() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const res = await fetch("/api/settings/storm-ai/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, trigger: trimmed }),
      });
      if (!res.ok) throw new Error("create failed");
      const issue = await res.json();
      setName("");
      router.push(`/settings/storm-ai/technician-assistant/${issue.id}`);
    } catch {
      toast.error("Could not create workflow");
    } finally {
      setCreating(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this diagnostic workflow?")) return;
    const res = await fetch(`/api/settings/storm-ai/issues/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not delete");
      return;
    }
    toast.success("Deleted");
    void load();
  }

  async function move(id: string, direction: -1 | 1) {
    const index = issues.findIndex((issue) => issue.id === id);
    const swap = issues[index + direction];
    if (index < 0 || !swap) return;
    await Promise.all([
      fetch(`/api/settings/storm-ai/issues/${issues[index]!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: swap.sortOrder }),
      }),
      fetch(`/api/settings/storm-ai/issues/${swap.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: issues[index]!.sortOrder }),
      }),
    ]);
    void load();
  }

  return (
    <ContentArea className="max-w-3xl">
      <PageHeader
        breadcrumb={["Settings", "Storm AI", "Technician Assistant"]}
        title="Technician Assistant"
        subtitle="Issues (triggers) and diagnostic workflows Storm AI walks technicians through one step at a time"
      />

      <div className="mb-6 flex gap-2">
        <Input
          placeholder="New issue, e.g. Zone valve not opening"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void createIssue();
          }}
        />
        <Button onClick={() => void createIssue()} disabled={creating || !name.trim()}>
          Add issue
        </Button>
      </div>

      <ul className="divide-y rounded-lg border border-border bg-card">
        {issues.length === 0 ? (
          <li className="p-4 text-sm text-muted-foreground">No workflows yet.</li>
        ) : (
          issues.map((issue, index) => (
            <li key={issue.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <Link
                  href={`/settings/storm-ai/technician-assistant/${issue.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {issue.name}
                </Link>
                <p className="text-xs text-muted-foreground">
                  Trigger: {issue.trigger} · {issue.nodeCount} steps
                  {issue.active ? "" : " · inactive"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={index === 0}
                  onClick={() => void move(issue.id, -1)}
                >
                  Up
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={index === issues.length - 1}
                  onClick={() => void move(issue.id, 1)}
                >
                  Down
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => void remove(issue.id)}>
                  Delete
                </Button>
              </div>
            </li>
          ))
        )}
      </ul>
    </ContentArea>
  );
}
