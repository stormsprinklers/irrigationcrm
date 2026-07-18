"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EmployeeRecord } from "./EmployeeForm";

type Crew = {
  id: string;
  name: string;
  color: string;
  division: "INSTALL" | "SERVICE" | null;
  foremanUserId?: string | null;
  members: { user: { id: string; name: string } }[];
  _count?: { visits: number };
};

type Props = {
  employees: EmployeeRecord[];
};

export function CrewManager({ employees }: Props) {
  const [crews, setCrews] = useState<Crew[]>([]);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#16A34A");
  const [editingMembers, setEditingMembers] = useState<string | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [foremanUserId, setForemanUserId] = useState<string>("");

  const load = useCallback(async () => {
    const res = await fetch("/api/settings/crews");
    if (res.ok) setCrews(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createCrew() {
    if (!newName.trim()) return;
    const res = await fetch("/api/settings/crews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, color: newColor }),
    });
    if (!res.ok) {
      toast.error("Failed to create crew");
      return;
    }
    setNewName("");
    toast.success("Crew created");
    await load();
  }

  async function saveMembers(crewId: string) {
    const resolvedForeman =
      foremanUserId && selectedMembers.includes(foremanUserId)
        ? foremanUserId
        : selectedMembers[0] ?? null;
    const res = await fetch(`/api/settings/crews/${crewId}/members`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: selectedMembers, foremanUserId: resolvedForeman }),
    });
    if (!res.ok) {
      toast.error("Failed to update members");
      return;
    }
    toast.success("Crew members updated");
    setEditingMembers(null);
    await load();
  }

  async function deleteCrew(crew: Crew) {
    const visitCount = crew._count?.visits ?? 0;
    const message =
      visitCount > 0
        ? `Delete "${crew.name}"? ${visitCount} visit${visitCount === 1 ? "" : "s"} linked to this crew will remain on the schedule but will no longer be assigned to the crew.`
        : `Delete "${crew.name}"?`;
    if (!confirm(message)) return;
    const res = await fetch(`/api/settings/crews/${crew.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Delete failed");
      return;
    }
    toast.success("Crew deleted");
    await load();
  }

  function toggleMember(empId: string) {
    setSelectedMembers((prev) => {
      const next = prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId];
      if (foremanUserId && !next.includes(foremanUserId)) {
        setForemanUserId(next[0] ?? "");
      } else if (!foremanUserId && next.length) {
        setForemanUserId(next[0]);
      }
      return next;
    });
  }

  return (
    <section className="rounded-lg border border-border p-4">
      <h3 className="mb-4 text-lg font-semibold">Crews</h3>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="text-sm font-medium">New crew name</label>
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Install Crew A" />
        </div>
        <div>
          <label className="text-sm font-medium">Color</label>
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="block h-10 w-14 cursor-pointer rounded border border-border"
          />
        </div>
        <Button onClick={createCrew}>Add crew</Button>
      </div>

      <div className="space-y-3">
        {crews.map((crew) => {
          const foremanName =
            crew.members.find((m) => m.user.id === crew.foremanUserId)?.user.name ??
            crew.members[0]?.user.name;
          return (
            <div key={crew.id} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: crew.color }} />
                  <span className="font-medium">{crew.name}</span>
                  {crew.division ? <Badge variant="outline">{crew.division}</Badge> : null}
                  <span className="text-sm text-muted-foreground">
                    {crew.members.map((m) => m.user.name).join(", ") || "No members"}
                    {foremanName ? ` · Foreman: ${foremanName}` : ""}
                    {crew._count?.visits
                      ? ` · ${crew._count.visits} visit${crew._count.visits === 1 ? "" : "s"}`
                      : ""}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingMembers(crew.id);
                      const memberIds = crew.members.map((m) => m.user.id);
                      setSelectedMembers(memberIds);
                      setForemanUserId(
                        crew.foremanUserId && memberIds.includes(crew.foremanUserId)
                          ? crew.foremanUserId
                          : memberIds[0] ?? ""
                      );
                    }}
                  >
                    Edit members
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteCrew(crew)}>
                    Delete
                  </Button>
                </div>
              </div>

              {editingMembers === crew.id && (
                <div className="mt-3 space-y-2 border-t border-border pt-3">
                  <p className="text-sm font-medium">Select members</p>
                  <div className="flex flex-wrap gap-2">
                    {employees.map((emp) => (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => toggleMember(emp.id)}
                        className={`rounded-full border px-3 py-1 text-xs ${
                          selectedMembers.includes(emp.id)
                            ? "border-primary bg-primary/10"
                            : "border-border"
                        }`}
                      >
                        {emp.name}
                      </button>
                    ))}
                  </div>
                  {selectedMembers.length > 0 ? (
                    <div>
                      <label className="text-sm font-medium">Foreman (schedule photo)</label>
                      <select
                        className="mt-1 flex h-9 w-full max-w-xs rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                        value={foremanUserId}
                        onChange={(e) => setForemanUserId(e.target.value)}
                      >
                        {selectedMembers.map((id) => {
                          const emp = employees.find((e) => e.id === id);
                          return (
                            <option key={id} value={id}>
                              {emp?.name ?? id}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  ) : null}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => saveMembers(crew.id)}>
                      Save members
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingMembers(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
