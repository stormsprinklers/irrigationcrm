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

export default function VoiceGroupsPage() {
  const [groups, setGroups] = useState<AgentGroup[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [name, setName] = useState("CSR team");
  const [ringStrategy, setRingStrategy] = useState<(typeof STRATEGIES)[number]>("SIMULTANEOUS");
  const [ringTimeoutSec, setRingTimeoutSec] = useState(30);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

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

  return (
    <ContentArea className="max-w-3xl">
      <PageHeader breadcrumb={["Settings", "Voice", "Agent groups"]} title="Agent groups" />

      <form onSubmit={createGroup} className="mb-8 space-y-4 rounded-lg border border-border bg-white p-6">
        <h3 className="font-semibold">New group</h3>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
        <select
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
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
            <p className="font-medium">{group.name}</p>
            <p className="text-muted-foreground">
              {group.ringStrategy} · {group.ringTimeoutSec}s timeout
            </p>
            <p className="mt-1 text-muted-foreground">
              {group.members.map((m) => m.user.name).join(", ") || "No members"}
            </p>
          </li>
        ))}
        {!groups.length && (
          <li className="p-4 text-muted-foreground">No agent groups yet.</li>
        )}
      </ul>
    </ContentArea>
  );
}
