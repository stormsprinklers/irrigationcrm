"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type FlowNode = {
  id: string;
  type: string;
  config: Record<string, unknown>;
  sortOrder: number;
};

type CallFlow = {
  id: string;
  name: string;
  description: string | null;
  nodes: FlowNode[];
};

type AgentGroup = { id: string; name: string };

const NODE_TYPES = [
  "DIAL_GROUP",
  "IVR",
  "QUEUE",
  "FORWARD",
  "VOICEMAIL",
  "HANGUP",
] as const;

export default function VoiceFlowsPage() {
  const router = useRouter();
  const [flows, setFlows] = useState<CallFlow[]>([]);
  const [groups, setGroups] = useState<AgentGroup[]>([]);
  const [name, setName] = useState("Main line");
  const [stepType, setStepType] = useState<(typeof NODE_TYPES)[number]>("DIAL_GROUP");
  const [groupId, setGroupId] = useState("");
  const [ivrPrompt, setIvrPrompt] = useState("Press 1 for service.");

  function load() {
    Promise.all([
      fetch("/api/settings/voice/flows").then((r) => r.json()),
      fetch("/api/settings/voice/groups").then((r) => r.json()),
    ])
      .then(([fl, gr]) => {
        setFlows(fl);
        setGroups(gr.map((g: AgentGroup) => ({ id: g.id, name: g.name })));
        if (gr[0]?.id) setGroupId(gr[0].id);
      })
      .catch(() => toast.error("Failed to load flows"));
  }

  useEffect(() => {
    load();
  }, []);

  async function createFlow(e: React.FormEvent) {
    e.preventDefault();
    const config =
      stepType === "DIAL_GROUP"
        ? { groupId: groupId || undefined }
        : stepType === "IVR"
          ? { promptText: ivrPrompt, options: [{ digit: "1", label: "Service" }] }
          : {};

    const res = await fetch("/api/settings/voice/flows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        steps: [{ type: stepType, config }],
      }),
    });
    if (!res.ok) {
      toast.error("Failed to create flow");
      return;
    }
    const created = await res.json();
    toast.success("Call flow created");
    router.push(`/settings/voice/flows/${created.id}`);
  }

  async function deleteFlow(id: string) {
    if (!confirm("Delete this call flow?")) return;
    const res = await fetch(`/api/settings/voice/flows/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete");
      return;
    }
    load();
    toast.success("Flow deleted");
  }

  return (
    <ContentArea className="max-w-3xl">
      <PageHeader breadcrumb={["Settings", "Voice", "Call flows"]} title="Call flows" />

      <form onSubmit={createFlow} className="mb-8 space-y-4 rounded-lg border border-border bg-white p-6">
        <h3 className="font-semibold">New flow</h3>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Flow name" />
        <select
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={stepType}
          onChange={(e) => setStepType(e.target.value as (typeof NODE_TYPES)[number])}
        >
          {NODE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace("_", " ")}
            </option>
          ))}
        </select>
        {stepType === "DIAL_GROUP" && (
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}
        {stepType === "IVR" && (
          <Input value={ivrPrompt} onChange={(e) => setIvrPrompt(e.target.value)} />
        )}
        <Button type="submit">Create flow</Button>
      </form>

      <ul className="divide-y divide-border rounded-lg border border-border bg-white">
        {flows.map((flow) => (
          <li key={flow.id} className="flex items-start justify-between gap-4 p-4">
            <div>
              <p className="font-medium">{flow.name}</p>
              <ol className="mt-2 list-decimal pl-5 text-sm text-muted-foreground">
                {flow.nodes.map((node) => (
                  <li key={node.id}>
                    {node.type}
                    {node.type === "DIAL_GROUP" && node.config?.groupId
                      ? ` → group ${String(node.config.groupId).slice(0, 8)}…`
                      : ""}
                  </li>
                ))}
              </ol>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/settings/voice/flows/${flow.id}`}>Edit</Link>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void deleteFlow(flow.id)}>
                Delete
              </Button>
            </div>
          </li>
        ))}
        {!flows.length && (
          <li className="p-4 text-sm text-muted-foreground">No call flows yet.</li>
        )}
      </ul>
    </ContentArea>
  );
}
