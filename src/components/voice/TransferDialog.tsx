"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type AgentOption = {
  userId: string;
  name: string;
  status: string;
};

export function TransferDialog({
  open,
  onOpenChange,
  onTransfer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTransfer: (targetUserId: string, type: "warm" | "cold") => Promise<void>;
}) {
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [targetUserId, setTargetUserId] = useState("");
  const [type, setType] = useState<"warm" | "cold">("cold");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/voice/presence/agents")
      .then((r) => r.json())
      .then((data) => setAgents(data.agents ?? []))
      .catch(() => setAgents([]));
  }, [open]);

  if (!open) return null;

  async function handleSubmit() {
    if (!targetUserId) return;
    setSubmitting(true);
    await onTransfer(targetUserId, type);
    setSubmitting(false);
    onOpenChange(false);
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold">Transfer call</h2>
        <p className="text-sm text-muted-foreground">
          Transfer to an available agent in the browser softphone.
        </p>
        <div className="mt-4 space-y-4">
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
          <div>
            <label className="mb-1 block text-sm font-medium">Transfer type</label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value as "warm" | "cold")}
            >
              <option value="cold">Cold — connect customer to agent</option>
              <option value="warm">Warm — consult then complete</option>
            </select>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!targetUserId || submitting} onClick={handleSubmit}>
            Transfer
          </Button>
        </div>
      </div>
    </div>
  );
}
