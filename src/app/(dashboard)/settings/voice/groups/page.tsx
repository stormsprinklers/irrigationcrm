"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

type Employee = { id: string; name: string; email: string };

type AgentGroup = {
  id: string;
  name: string;
  ringStrategy: string;
  ringTimeoutSec: number;
  members: Array<{ userId: string; user: { id: string; name: string } }>;
};

const STRATEGIES = ["SIMULTANEOUS", "ROUND_ROBIN", "SEQUENTIAL"] as const;

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

export default function VoiceGroupsPage() {
  const [groups, setGroups] = useState<AgentGroup[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [name, setName] = useState("CSR team");
  const [ringStrategy, setRingStrategy] = useState<(typeof STRATEGIES)[number]>("SIMULTANEOUS");
  const [ringTimeoutSec, setRingTimeoutSec] = useState(30);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    ringStrategy: "SIMULTANEOUS" as (typeof STRATEGIES)[number],
    ringTimeoutSec: 30,
    memberUserIds: [] as string[],
  });

  function load() {
    Promise.all([
      fetch("/api/settings/voice/groups").then((r) => r.json()),
      fetch("/api/settings/employees?status=ACTIVE").then((r) => r.json()),
    ])
      .then(([gr, em]) => {
        setGroups(gr);
        setEmployees(em);
      })
      .catch(() => toast.error("Failed to load groups"));
  }

  useEffect(() => {
    load();
  }, []);

  function toggleMember(userId: string) {
    setSelectedMembers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }

  function toggleEditMember(userId: string) {
    setEditForm((prev) => ({
      ...prev,
      memberUserIds: prev.memberUserIds.includes(userId)
        ? prev.memberUserIds.filter((id) => id !== userId)
        : [...prev.memberUserIds, userId],
    }));
  }

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/settings/voice/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        ringStrategy,
        ringTimeoutSec,
        memberUserIds: selectedMembers,
      }),
    });
    if (!res.ok) {
      toast.error("Failed to create group");
      return;
    }
    load();
    toast.success("Agent group created");
  }

  function startEdit(group: AgentGroup) {
    setEditingId(group.id);
    setEditForm({
      name: group.name,
      ringStrategy: group.ringStrategy as (typeof STRATEGIES)[number],
      ringTimeoutSec: group.ringTimeoutSec,
      memberUserIds: group.members.map((m) => m.userId),
    });
  }

  async function saveEdit() {
    if (!editingId) return;
    const res = await fetch(`/api/settings/voice/groups/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    if (!res.ok) {
      toast.error("Failed to update group");
      return;
    }
    setEditingId(null);
    load();
    toast.success("Group updated");
  }

  async function deleteGroup(id: string) {
    if (!confirm("Delete this agent group?")) return;
    const res = await fetch(`/api/settings/voice/groups/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete group");
      return;
    }
    load();
    toast.success("Group deleted");
  }

  return (
    <ContentArea className="max-w-3xl">
      <PageHeader breadcrumb={["Settings", "Voice", "Agent groups"]} title="Agent groups" />

      <form onSubmit={createGroup} className="mb-8 space-y-4 rounded-lg border border-border bg-white p-6">
        <h3 className="font-semibold">New group</h3>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
        <select
          className={selectClass}
          value={ringStrategy}
          onChange={(e) => setRingStrategy(e.target.value as (typeof STRATEGIES)[number])}
        >
          {STRATEGIES.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>
        <Input
          type="number"
          min={10}
          max={120}
          value={ringTimeoutSec}
          onChange={(e) => setRingTimeoutSec(Number(e.target.value))}
          placeholder="Ring timeout (seconds)"
        />
        <div className="space-y-2">
          <p className="text-sm font-medium">Members</p>
          {employees.map((emp) => (
            <label key={emp.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selectedMembers.includes(emp.id)}
                onCheckedChange={() => toggleMember(emp.id)}
              />
              {emp.name}
            </label>
          ))}
        </div>
        <Button type="submit">Create group</Button>
      </form>

      <ul className="divide-y divide-border rounded-lg border border-border bg-white">
        {groups.map((group) => (
          <li key={group.id} className="p-4 text-sm">
            {editingId === group.id ? (
              <div className="space-y-3">
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
                <select
                  className={selectClass}
                  value={editForm.ringStrategy}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      ringStrategy: e.target.value as (typeof STRATEGIES)[number],
                    })
                  }
                >
                  {STRATEGIES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace("_", " ")}
                    </option>
                  ))}
                </select>
                <Input
                  type="number"
                  min={10}
                  max={120}
                  value={editForm.ringTimeoutSec}
                  onChange={(e) =>
                    setEditForm({ ...editForm, ringTimeoutSec: Number(e.target.value) })
                  }
                />
                <div className="space-y-2">
                  <p className="font-medium">Members</p>
                  {employees.map((emp) => (
                    <label key={emp.id} className="flex items-center gap-2">
                      <Checkbox
                        checked={editForm.memberUserIds.includes(emp.id)}
                        onCheckedChange={() => toggleEditMember(emp.id)}
                      />
                      {emp.name}
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void saveEdit()}>
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{group.name}</p>
                    <p className="text-muted-foreground">
                      {group.ringStrategy} · {group.ringTimeoutSec}s timeout
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {group.members.map((m) => m.user.name).join(", ") || "No members"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button variant="outline" size="sm" onClick={() => startEdit(group)}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void deleteGroup(group.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </>
            )}
          </li>
        ))}
        {!groups.length && (
          <li className="p-4 text-muted-foreground">No agent groups yet.</li>
        )}
      </ul>
    </ContentArea>
  );
}
