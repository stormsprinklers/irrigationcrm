"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

type PhoneNumberRow = {
  id: string;
  e164: string;
  friendlyName: string | null;
  isPrimary: boolean;
  callFlowId: string | null;
  callFlow?: { id: string; name: string } | null;
};

type CallFlowOption = { id: string; name: string };

export default function VoiceNumbersPage() {
  const [numbers, setNumbers] = useState<PhoneNumberRow[]>([]);
  const [flows, setFlows] = useState<CallFlowOption[]>([]);
  const [e164, setE164] = useState("");
  const [friendlyName, setFriendlyName] = useState("");
  const [callFlowId, setCallFlowId] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);

  function load() {
    Promise.all([
      fetch("/api/settings/voice/numbers").then((r) => r.json()),
      fetch("/api/settings/voice/flows").then((r) => r.json()),
    ])
      .then(([nums, fl]) => {
        setNumbers(nums);
        setFlows(fl.map((f: CallFlowOption) => ({ id: f.id, name: f.name })));
      })
      .catch(() => toast.error("Failed to load numbers"));
  }

  useEffect(() => {
    load();
  }, []);

  async function addNumber(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/settings/voice/numbers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ e164, friendlyName, callFlowId: callFlowId || null, isPrimary }),
    });
    if (!res.ok) {
      toast.error("Failed to add number");
      return;
    }
    setE164("");
    setFriendlyName("");
    load();
    toast.success("Number added");
  }

  return (
    <ContentArea className="max-w-3xl">
      <PageHeader breadcrumb={["Settings", "Voice", "Numbers"]} title="Phone numbers" />

      <form onSubmit={addNumber} className="mb-8 space-y-4 rounded-lg border border-border bg-white p-6">
        <h3 className="font-semibold">Add tracking number</h3>
        <Input placeholder="+18015550100" value={e164} onChange={(e) => setE164(e.target.value)} />
        <Input
          placeholder="Friendly name"
          value={friendlyName}
          onChange={(e) => setFriendlyName(e.target.value)}
        />
        <select
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={callFlowId}
          onChange={(e) => setCallFlowId(e.target.value)}
        >
          <option value="">Default flow (ring agents)</option>
          {flows.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={isPrimary} onCheckedChange={(c) => setIsPrimary(Boolean(c))} />
          Primary caller ID
        </label>
        <Button type="submit">Add number</Button>
      </form>

      <ul className="divide-y divide-border rounded-lg border border-border bg-white">
        {numbers.map((n) => (
          <li key={n.id} className="flex items-center justify-between p-4 text-sm">
            <div>
              <p className="font-medium">
                {n.friendlyName ?? n.e164}
                {n.isPrimary ? " · Primary" : ""}
              </p>
              <p className="text-muted-foreground">
                {n.e164} · Flow: {n.callFlow?.name ?? "Default"}
              </p>
            </div>
          </li>
        ))}
        {!numbers.length && (
          <li className="p-4 text-sm text-muted-foreground">No tracking numbers yet.</li>
        )}
      </ul>
    </ContentArea>
  );
}
