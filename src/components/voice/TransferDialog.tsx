"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

type Destination = "agent" | "employee" | "number";

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `•••-•••-${digits.slice(-4)}`;
}

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
    options?: {
      mode?: "agent" | "employee_phone" | "external_number";
      phone?: string;
      displayName?: string;
    }
  ) => Promise<void>;
}) {
  const [destination, setDestination] = useState<Destination>("agent");
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [targetUserId, setTargetUserId] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneLabel, setPhoneLabel] = useState("");
  const [type, setType] = useState<"warm" | "cold">("warm");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTargetUserId("");
    setPhone("");
    setPhoneLabel("");
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
    if (destination === "number") {
      if (!phone.trim()) return;
      setSubmitting(true);
      try {
        await onTransfer("", type, {
          mode: "external_number",
          phone: phone.trim(),
          displayName: phoneLabel.trim() || undefined,
        });
        onOpenChange(false);
      } finally {
        setSubmitting(false);
      }
      return;
    }

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
  const canSubmit =
    destination === "number" ? Boolean(phone.trim()) : Boolean(targetUserId);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold">Transfer call</h2>
        <p className="text-sm text-muted-foreground">
          Warm transfer is default — you stay on the line until you hang up. Transfers to a cell
          phone use the company number, so the customer never sees that person’s number.
        </p>
        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Destination</label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={destination}
              onChange={(e) => {
                setDestination(e.target.value as Destination);
                setTargetUserId("");
                setPhone("");
              }}
            >
              <option value="agent">Another agent (in-app softphone)</option>
              <option value="employee">Employee cell / phone on file</option>
              <option value="number">Any phone number</option>
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
          ) : null}

          {destination === "employee" ? (
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
                    {e.name} · {maskPhone(e.phone!)}
                  </option>
                ))}
              </select>
              {!employeeChoices.length ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  No employees have a phone number on file in Settings → Team.
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  Rings their phone from the company line and bridges the call. The customer stays on
                  the original call and never sees this number.
                </p>
              )}
            </div>
          ) : null}

          {destination === "number" ? (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Phone number</label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. (801) 555-1234"
                  inputMode="tel"
                  autoComplete="tel"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Label (optional)</label>
                <Input
                  value={phoneLabel}
                  onChange={(e) => setPhoneLabel(e.target.value)}
                  placeholder="e.g. Mike — field tech"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Twilio dials this number as a private conference leg from your company caller ID.
                The customer does not see or receive this number.
              </p>
            </div>
          ) : null}

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
            {destination !== "agent" && type === "warm" ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Customer hears hold music while you consult; they reconnect when you hang up.
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSubmit || submitting} onClick={() => void handleSubmit()}>
            Transfer
          </Button>
        </div>
      </div>
    </div>
  );
}
