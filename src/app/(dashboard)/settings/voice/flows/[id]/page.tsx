"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type FlowNode = {
  id?: string;
  type: string;
  config: Record<string, unknown>;
  sortOrder: number;
};

type IvrOption = { digit: string; label: string; nextNodeId: string };

type CallFlow = {
  id: string;
  name: string;
  description: string | null;
  entryNodeId: string | null;
  afterHoursNodeId: string | null;
  nodes: FlowNode[];
};

type AgentGroup = { id: string; name: string };
type VoiceClip = { id: string; name: string };
type CompanyUser = { id: string; name: string };

const NODE_TYPES = [
  "DIAL_GROUP",
  "DIAL_USER",
  "IVR",
  "QUEUE",
  "FORWARD",
  "VOICEMAIL",
  "HANGUP",
] as const;

const NODE_TYPE_LABELS: Record<(typeof NODE_TYPES)[number], string> = {
  DIAL_GROUP: "Dial group",
  DIAL_USER: "Ring a person's app",
  IVR: "IVR menu",
  QUEUE: "Queue",
  FORWARD: "Forward",
  VOICEMAIL: "Voicemail",
  HANGUP: "Hang up",
};

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

function defaultConfig(type: string): Record<string, unknown> {
  switch (type) {
    case "IVR":
      return {
        promptText: "Press 1 for service.",
        options: [{ digit: "1", label: "Service", nextNodeId: "" }],
      };
    case "FORWARD":
      return { forwardTo: "" };
    case "DIAL_GROUP":
      return { groupId: "" };
    case "DIAL_USER":
      return { userId: "", timeoutSec: 30 };
    default:
      return {};
  }
}

export default function FlowEditorPage() {
  const params = useParams();
  const router = useRouter();
  const flowId = params.id as string;

  const [flow, setFlow] = useState<CallFlow | null>(null);
  const [groups, setGroups] = useState<AgentGroup[]>([]);
  const [clips, setClips] = useState<VoiceClip[]>([]);
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [saving, setSaving] = useState(false);

  function load() {
    Promise.all([
      fetch(`/api/settings/voice/flows/${flowId}`).then((r) => r.json()),
      fetch("/api/settings/voice/groups").then((r) => r.json()),
      fetch("/api/settings/voice/clips").then((r) => r.json()),
      fetch("/api/settings/employees?status=ACTIVE").then((r) => r.json()),
    ])
      .then(([fl, gr, cl, us]) => {
        if (fl.error) throw new Error(fl.error);
        setFlow(fl);
        setGroups(gr);
        setClips(cl);
        setUsers(
          Array.isArray(us)
            ? us.map((u: { id: string; name: string }) => ({ id: u.id, name: u.name }))
            : []
        );
      })
      .catch(() => toast.error("Failed to load flow"));
  }

  useEffect(() => {
    load();
  }, [flowId]);

  function updateNode(index: number, patch: Partial<FlowNode>) {
    if (!flow) return;
    const nodes = [...flow.nodes];
    nodes[index] = { ...nodes[index], ...patch };
    setFlow({ ...flow, nodes });
  }

  function updateNodeConfig(index: number, config: Record<string, unknown>) {
    updateNode(index, { config });
  }

  function addNode(type: (typeof NODE_TYPES)[number]) {
    if (!flow) return;
    setFlow({
      ...flow,
      nodes: [
        ...flow.nodes,
        { type, config: defaultConfig(type), sortOrder: flow.nodes.length },
      ],
    });
  }

  function removeNode(index: number) {
    if (!flow) return;
    const removed = flow.nodes[index];
    const nodes = flow.nodes.filter((_, i) => i !== index);
    setFlow({
      ...flow,
      nodes,
      entryNodeId: flow.entryNodeId === removed.id ? null : flow.entryNodeId,
      afterHoursNodeId: flow.afterHoursNodeId === removed.id ? null : flow.afterHoursNodeId,
    });
  }

  async function save() {
    if (!flow) return;
    setSaving(true);
    const res = await fetch(`/api/settings/voice/flows/${flowId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: flow.name,
        description: flow.description,
        entryNodeId: flow.entryNodeId,
        afterHoursNodeId: flow.afterHoursNodeId,
        steps: flow.nodes.map((n, i) => ({
          id: n.id,
          type: n.type,
          config: n.config,
          sortOrder: i,
        })),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error("Failed to save");
      return;
    }
    const updated = await res.json();
    setFlow(updated);
    toast.success("Flow saved");
  }

  if (!flow) {
    return (
      <ContentArea>
        <PageHeader breadcrumb={["Settings", "Voice", "Call flows"]} title="Edit flow" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </ContentArea>
    );
  }

  const nodeOptions = flow.nodes.map((n, i) => ({
    value: n.id ?? `new-${i}`,
    label: `#${i + 1} ${n.type}`,
    index: i,
  }));

  return (
    <ContentArea className="max-w-3xl">
      <PageHeader
        breadcrumb={["Settings", "Voice", "Call flows", flow.name]}
        title="Edit call flow"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/settings/voice/flows">Back</Link>
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        }
      />

      <div className="mb-6 space-y-3 rounded-lg border border-border bg-white p-6">
        <Input
          value={flow.name}
          onChange={(e) => setFlow({ ...flow, name: e.target.value })}
          placeholder="Flow name"
        />
        <Input
          value={flow.description ?? ""}
          onChange={(e) => setFlow({ ...flow, description: e.target.value || null })}
          placeholder="Description (optional)"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Entry node</label>
            <select
              className={selectClass}
              value={flow.entryNodeId ?? ""}
              onChange={(e) => setFlow({ ...flow, entryNodeId: e.target.value || null })}
            >
              <option value="">First node</option>
              {flow.nodes.map((n, i) => (
                <option key={n.id ?? i} value={n.id ?? ""}>
                  #{i + 1} {n.type}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">After-hours node</label>
            <select
              className={selectClass}
              value={flow.afterHoursNodeId ?? ""}
              onChange={(e) => setFlow({ ...flow, afterHoursNodeId: e.target.value || null })}
            >
              <option value="">None</option>
              {flow.nodes.map((n, i) => (
                <option key={n.id ?? i} value={n.id ?? ""}>
                  #{i + 1} {n.type}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {NODE_TYPES.map((t) => (
          <Button key={t} type="button" variant="outline" size="sm" onClick={() => addNode(t)}>
            + {NODE_TYPE_LABELS[t]}
          </Button>
        ))}
      </div>

      <div className="space-y-4">
        {flow.nodes.map((node, index) => (
          <div key={node.id ?? index} className="rounded-lg border border-border bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-medium">
                #{index + 1} {NODE_TYPE_LABELS[node.type as (typeof NODE_TYPES)[number]] ?? node.type}
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeNode(index)}>
                Remove
              </Button>
            </div>

            <select
              className={`${selectClass} mb-3`}
              value={node.type}
              onChange={(e) =>
                updateNode(index, {
                  type: e.target.value,
                  config: defaultConfig(e.target.value),
                })
              }
            >
              {NODE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {NODE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>

            {node.type === "DIAL_GROUP" && (
              <select
                className={selectClass}
                value={String(node.config.groupId ?? "")}
                onChange={(e) =>
                  updateNodeConfig(index, { ...node.config, groupId: e.target.value })
                }
              >
                <option value="">Default group</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            )}

            {node.type === "DIAL_USER" && (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">Ring this person</label>
                  <select
                    className={selectClass}
                    value={String(node.config.userId ?? "")}
                    onChange={(e) =>
                      updateNodeConfig(index, { ...node.config, userId: e.target.value })
                    }
                  >
                    <option value="">Select a person…</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Rings their web softphone and their iOS app (including a push notification
                    when the app is closed, if notifications are enabled).
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Ring timeout (seconds)</label>
                  <Input
                    type="number"
                    min={10}
                    max={120}
                    value={Number(node.config.timeoutSec ?? 30)}
                    onChange={(e) =>
                      updateNodeConfig(index, {
                        ...node.config,
                        timeoutSec: Number(e.target.value) || 30,
                      })
                    }
                  />
                </div>
              </div>
            )}

            {node.type === "FORWARD" && (
              <Input
                value={String(node.config.forwardTo ?? "")}
                onChange={(e) =>
                  updateNodeConfig(index, { ...node.config, forwardTo: e.target.value })
                }
                placeholder="Phone number (E.164)"
              />
            )}

            {node.type === "IVR" && (
              <div className="space-y-3">
                <Input
                  value={String(node.config.promptText ?? node.config.prompt ?? "")}
                  onChange={(e) =>
                    updateNodeConfig(index, { ...node.config, promptText: e.target.value })
                  }
                  placeholder="Prompt text (TTS fallback)"
                />
                <div>
                  <label className="mb-1 block text-sm font-medium">Prompt audio clip</label>
                  <select
                    className={selectClass}
                    value={String(node.config.promptClipId ?? "")}
                    onChange={(e) =>
                      updateNodeConfig(index, {
                        ...node.config,
                        promptClipId: e.target.value || undefined,
                      })
                    }
                  >
                    <option value="">Text-to-speech only</option>
                    {clips.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium">Digit options</p>
                  {((node.config.options as IvrOption[]) ?? []).map((opt, optIdx) => (
                    <div key={optIdx} className="mb-2 grid grid-cols-3 gap-2">
                      <Input
                        value={opt.digit}
                        onChange={(e) => {
                          const options = [...((node.config.options as IvrOption[]) ?? [])];
                          options[optIdx] = { ...options[optIdx], digit: e.target.value };
                          updateNodeConfig(index, { ...node.config, options });
                        }}
                        placeholder="Digit"
                        maxLength={1}
                      />
                      <Input
                        value={opt.label}
                        onChange={(e) => {
                          const options = [...((node.config.options as IvrOption[]) ?? [])];
                          options[optIdx] = { ...options[optIdx], label: e.target.value };
                          updateNodeConfig(index, { ...node.config, options });
                        }}
                        placeholder="Label"
                      />
                      <select
                        className={selectClass}
                        value={opt.nextNodeId}
                        onChange={(e) => {
                          const options = [...((node.config.options as IvrOption[]) ?? [])];
                          options[optIdx] = { ...options[optIdx], nextNodeId: e.target.value };
                          updateNodeConfig(index, { ...node.config, options });
                        }}
                      >
                        <option value="">Next step</option>
                        {nodeOptions
                          .filter((o) => o.index !== index)
                          .map((o) => (
                            <option key={o.value} value={flow.nodes[o.index].id ?? ""}>
                              {o.label}
                            </option>
                          ))}
                      </select>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const options = [
                        ...((node.config.options as IvrOption[]) ?? []),
                        { digit: "", label: "", nextNodeId: "" },
                      ];
                      updateNodeConfig(index, { ...node.config, options });
                    }}
                  >
                    Add option
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 flex gap-2">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save flow"}
        </Button>
        <Button variant="outline" onClick={() => router.push("/settings/voice/flows")}>
          Cancel
        </Button>
      </div>
    </ContentArea>
  );
}
