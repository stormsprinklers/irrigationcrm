"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type AgentOption = {
  userId: string;
  name: string;
  status: string;
};

type EmployeeOption = {
  id: string;
  name: string;
  phone: string | null;
  role: string;
};

export function TransferDialog({
  open,
  onOpenChange,
  onTransfer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTransfer: (
    targetUserId: string,
    type: "warm" | "cold",
    options?: { mode?: "agent" | "employee_phone" }
  ) => Promise<void>;
}) {
  const [destination, setDestination] = useState<"agent" | "employee">("agent");
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [targetUserId, setTargetUserId] = useState("");
  const [type, setType] = useState<"warm" | "cold">("warm");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTargetUserId("");
    setType("warm");
    fetch("/api/voice/presence/agents")
      .then((r) => r.json())
      .then((data) => setAgents(data.agents ?? []))
      .catch(() => setAgents([]));
    fetch("/api/voice/transfer/employees")
      .then((r) => r.json())
      .then((data) => setEmployees(data.employees ?? []))
      .catch(() => setEmployees([]));
  }, [open]);

  if (!open) return null;

  async function handleSubmit() {
    if (!targetUserId) return;
    setSubmitting(true);
    try {
      await onTransfer(targetUserId, type, {
        mode: destination === "employee" ? "employee_phone" : "agent",
      });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  const employeeChoices = employees.filter((e) => e.phone?.trim());

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold">Transfer call</h2>
        <p className="text-sm text-muted-foreground">
          Warm transfer is default — you stay on the line until you hang up.
        </p>
        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Destination</label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={destination}
              onChange={(e) => {
                setDestination(e.target.value as "agent" | "employee");
                setTargetUserId("");
              }}
            >
              <option value="agent">Another agent (softphone)</option>
              <option value="employee">Employee personal phone</option>
            </select>
          </div>

          {destination === "agent" ? (
            <div>
              <label className="mb-1 block text-sm font-medium">Agent</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
              >
                <option value="">Select agent</option>
                {agents.map((a) => (
                  <option key={a.userId} value={a.userId}>
                    {a.name} ({a.status})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-sm font-medium">Employee</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
              >
                <option value="">Select employee</option>
                {employeeChoices.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} · {e.phone}
                  </option>
                ))}
              </select>
              {!employeeChoices.length ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  No employees have a personal phone number on file.
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  Rings their phone from the company number and joins everyone on one call.
                </p>
              )}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium">Transfer type</label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value as "warm" | "cold")}
            >
              <option value="warm">Warm — consult, then hang up when ready</option>
              <option value="cold">Cold — hand off immediately</option>
            </select>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!targetUserId || submitting} onClick={() => void handleSubmit()}>
            Transfer
          </Button>
        </div>
      </div>
    </div>
  );
}
