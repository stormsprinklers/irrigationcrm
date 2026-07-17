"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Hash,
  PhoneForwarded,
  PhoneIncoming,
  PhoneOff,
  Plus,
  Trash2,
  User,
  Users,
  Voicemail,
  Volume2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AudioSourcePicker, type AudioValue, type VoiceClip } from "@/components/voice/AudioSourcePicker";

type NodeType =
  | "PLAY"
  | "IVR"
  | "DIAL_USER"
  | "DIAL_GROUP"
  | "FORWARD"
  | "VOICEMAIL"
  | "QUEUE"
  | "HANGUP";

type FlowNode = {
  id?: string;
  type: NodeType;
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
type CompanyUser = { id: string; name: string };
type PhoneNumber = { id: string; e164: string; friendlyName: string | null; callFlow: { id: string } | null };

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

const STEP_META: Record<
  NodeType,
  { label: string; icon: typeof Volume2; blurb: string }
> = {
  PLAY: { label: "Play a greeting", icon: Volume2, blurb: "Play a recording or read a message" },
  IVR: { label: "Phone menu", icon: Hash, blurb: "Let callers press a key to choose" },
  DIAL_USER: { label: "Ring a person", icon: User, blurb: "Ring one teammate's app" },
  DIAL_GROUP: { label: "Ring a team", icon: Users, blurb: "Ring a group of agents" },
  FORWARD: { label: "Forward to a number", icon: PhoneForwarded, blurb: "Send the call to a phone number" },
  VOICEMAIL: { label: "Send to voicemail", icon: Voicemail, blurb: "Play a greeting and record a message" },
  QUEUE: {
    label: "Put caller in queue",
    icon: Clock,
    blurb: "Hold the caller with your queue wait music from Voice settings",
  },
  HANGUP: { label: "End call", icon: PhoneOff, blurb: "Hang up" },
};

const ADD_STEP_ORDER: NodeType[] = [
  "PLAY",
  "IVR",
  "DIAL_USER",
  "DIAL_GROUP",
  "FORWARD",
  "VOICEMAIL",
  "QUEUE",
  "HANGUP",
];

function defaultConfig(type: NodeType): Record<string, unknown> {
  switch (type) {
    case "PLAY":
      return { text: "Thank you for calling." };
    case "IVR":
      return {
        promptText: "Press 1 for service, or stay on the line.",
        options: [{ digit: "1", label: "Service", nextNodeId: "" }],
      };
    case "FORWARD":
      return { forwardTo: "" };
    case "DIAL_GROUP":
      return { groupId: "" };
    case "DIAL_USER":
      return { userId: "", timeoutSec: 30 };
    case "VOICEMAIL":
      return { greetingText: "Please leave a message after the tone." };
    default:
      return {};
  }
}

function stepSummary(
  node: FlowNode,
  ctx: { groups: AgentGroup[]; users: CompanyUser[]; clips: VoiceClip[] }
): string {
  const config = node.config;
  switch (node.type) {
    case "PLAY": {
      const clip = ctx.clips.find((c) => c.id === config.clipId);
      if (clip) return `Recording · ${clip.name}`;
      const text = String(config.text ?? "").trim();
      return text ? `“${text.slice(0, 40)}${text.length > 40 ? "…" : ""}”` : "Not set";
    }
    case "IVR": {
      const count = ((config.options as IvrOption[]) ?? []).length;
      return `${count} option${count === 1 ? "" : "s"}`;
    }
    case "DIAL_USER": {
      const u = ctx.users.find((x) => x.id === config.userId);
      return u ? u.name : "No one selected";
    }
    case "DIAL_GROUP": {
      const g = ctx.groups.find((x) => x.id === config.groupId);
      return g ? g.name : "Default team";
    }
    case "FORWARD":
      return String(config.forwardTo ?? "") || "No number set";
    case "VOICEMAIL":
      return "Records a message";
    case "QUEUE":
      return "Hold with music";
    case "HANGUP":
      return "Call will disconnect";
    default:
      return "";
  }
}

export default function FlowEditorPage() {
  const params = useParams();
  const flowId = params.id as string;

  const [flow, setFlow] = useState<CallFlow | null>(null);
  const [groups, setGroups] = useState<AgentGroup[]>([]);
  const [clips, setClips] = useState<VoiceClip[]>([]);
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [numbers, setNumbers] = useState<PhoneNumber[]>([]);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [addMenuAt, setAddMenuAt] = useState<number | null>(null);

  function load() {
    Promise.all([
      fetch(`/api/settings/voice/flows/${flowId}`).then((r) => r.json()),
      fetch("/api/settings/voice/groups").then((r) => r.json()),
      fetch("/api/settings/voice/clips").then((r) => r.json()),
      fetch("/api/settings/employees?status=ACTIVE").then((r) => r.json()),
      fetch("/api/settings/voice/numbers").then((r) => r.json()),
    ])
      .then(([fl, gr, cl, us, nums]) => {
        if (fl.error) throw new Error(fl.error);
        setFlow(fl);
        setGroups(Array.isArray(gr) ? gr : []);
        setClips(Array.isArray(cl) ? cl : []);
        setUsers(
          Array.isArray(us)
            ? us.map((u: { id: string; name: string }) => ({ id: u.id, name: u.name }))
            : []
        );
        setNumbers(Array.isArray(nums) ? nums : []);
      })
      .catch(() => toast.error("Failed to load flow"));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId]);

  function updateNodeConfig(index: number, config: Record<string, unknown>) {
    if (!flow) return;
    const nodes = [...flow.nodes];
    nodes[index] = { ...nodes[index], config };
    setFlow({ ...flow, nodes });
  }

  function insertNode(position: number, type: NodeType) {
    if (!flow) return;
    const nodes = [...flow.nodes];
    nodes.splice(position, 0, { type, config: defaultConfig(type), sortOrder: position });
    setFlow({ ...flow, nodes: nodes.map((n, i) => ({ ...n, sortOrder: i })) });
    setAddMenuAt(null);
    setExpanded(position);
  }

  function removeNode(index: number) {
    if (!flow) return;
    const removed = flow.nodes[index];
    const nodes = flow.nodes
      .filter((_, i) => i !== index)
      .map((n, i) => ({ ...n, sortOrder: i }));
    setFlow({
      ...flow,
      nodes,
      entryNodeId: flow.entryNodeId === removed.id ? null : flow.entryNodeId,
      afterHoursNodeId: flow.afterHoursNodeId === removed.id ? null : flow.afterHoursNodeId,
    });
    setExpanded(null);
  }

  function moveNode(index: number, dir: -1 | 1) {
    if (!flow) return;
    const target = index + dir;
    if (target < 0 || target >= flow.nodes.length) return;
    const nodes = [...flow.nodes];
    [nodes[index], nodes[target]] = [nodes[target], nodes[index]];
    setFlow({ ...flow, nodes: nodes.map((n, i) => ({ ...n, sortOrder: i })) });
    setExpanded(target);
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
        entryNodeId: flow.nodes[0]?.id ?? null,
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

  const assignedNumbers = numbers.filter((n) => n.callFlow?.id === flow.id);
  const savedNodes = flow.nodes.filter((n) => n.id);

  const AddStepControl = ({ position }: { position: number }) => (
    <div className="flex flex-col items-center">
      <div className="h-4 w-px bg-border" />
      {addMenuAt === position ? (
        <div className="w-full max-w-sm rounded-lg border border-border bg-white p-2 shadow-sm">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-xs font-medium text-muted-foreground">Add a step</span>
            <button type="button" onClick={() => setAddMenuAt(null)}>
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-1">
            {ADD_STEP_ORDER.map((t) => {
              const meta = STEP_META[t];
              const Icon = meta.icon;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => insertNode(position, t)}
                  className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{meta.label}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{meta.blurb}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddMenuAt(position)}
          className="rounded-full border border-primary/40 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/5"
        >
          Add step
        </button>
      )}
      <div className="h-4 w-px bg-border" />
    </div>
  );

  return (
    <ContentArea className="max-w-2xl">
      <PageHeader
        breadcrumb={["Settings", "Voice", "Call flows", flow.name]}
        title="Call flow"
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

      <div className="mb-6 space-y-3 rounded-lg border border-border bg-white p-4">
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
      </div>

      <div className="flex flex-col items-center">
        {/* Incoming call */}
        <div className="w-full max-w-sm rounded-lg border border-border bg-muted/30 p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-sm font-semibold">
            <PhoneIncoming className="h-4 w-4" />
            Incoming call
          </div>
          <div className="mt-1.5 rounded-md border border-border bg-white px-3 py-1.5 text-sm text-muted-foreground">
            {assignedNumbers.length > 0
              ? `${assignedNumbers.length} phone number${assignedNumbers.length === 1 ? "" : "s"} assigned`
              : "No phone numbers assigned yet"}
          </div>
        </div>

        <div className="h-4 w-px bg-border" />

        {/* Call hours */}
        <div className="w-full max-w-sm rounded-lg border border-border bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Clock className="h-4 w-4" />
              Call hours
            </div>
            <Link href="/settings/voice/hours" className="text-xs text-primary hover:underline">
              Edit hours
            </Link>
          </div>
          <div className="mt-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              When closed (after hours)
            </label>
            <select
              className={selectClass}
              value={flow.afterHoursNodeId ?? ""}
              onChange={(e) => setFlow({ ...flow, afterHoursNodeId: e.target.value || null })}
            >
              <option value="">Follow the same steps</option>
              {savedNodes.map((n) => {
                const idx = flow.nodes.findIndex((x) => x === n);
                return (
                  <option key={n.id} value={n.id ?? ""}>
                    Jump to #{idx + 1} {STEP_META[n.type].label}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        <AddStepControl position={0} />

        {/* Steps */}
        {flow.nodes.map((node, index) => {
          const meta = STEP_META[node.type];
          const Icon = meta.icon;
          const isOpen = expanded === index;
          return (
            <div key={node.id ?? `new-${index}`} className="flex w-full flex-col items-center">
              <div className="w-full max-w-sm rounded-lg border border-border bg-white shadow-sm">
                <div className="flex items-center gap-3 p-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                    <Icon className="h-4 w-4" />
                  </div>
                  <button
                    type="button"
                    className="flex-1 text-left"
                    onClick={() => setExpanded(isOpen ? null : index)}
                  >
                    <p className="text-sm font-semibold">{meta.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {stepSummary(node, { groups, users, clips })}
                    </p>
                  </button>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => moveNode(index, -1)}
                      disabled={index === 0}
                      className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveNode(index, 1)}
                      disabled={index === flow.nodes.length - 1}
                      className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeNode(index)}
                      className="rounded p-1 text-muted-foreground hover:bg-muted"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {isOpen ? (
                  <div className="border-t border-border p-4">
                    <StepEditor
                      node={node}
                      index={index}
                      flow={flow}
                      groups={groups}
                      users={users}
                      clips={clips}
                      onClipsChange={setClips}
                      onConfigChange={(config) => updateNodeConfig(index, config)}
                    />
                  </div>
                ) : null}
              </div>

              <AddStepControl position={index + 1} />
            </div>
          );
        })}

        {/* End call */}
        <div className="w-full max-w-sm rounded-lg border border-border bg-muted/40 p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-sm font-semibold text-muted-foreground">
            <PhoneOff className="h-4 w-4" />
            End call
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            If no step answers, the call disconnects.
          </p>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save flow"}
        </Button>
      </div>
    </ContentArea>
  );
}

function StepEditor({
  node,
  index,
  flow,
  groups,
  users,
  clips,
  onClipsChange,
  onConfigChange,
}: {
  node: FlowNode;
  index: number;
  flow: CallFlow;
  groups: AgentGroup[];
  users: CompanyUser[];
  clips: VoiceClip[];
  onClipsChange: (clips: VoiceClip[]) => void;
  onConfigChange: (config: Record<string, unknown>) => void;
}) {
  const config = node.config;

  const audioFor = (clipKey: string, textKey: string): AudioValue => ({
    clipId: (config[clipKey] as string) || undefined,
    text: (config[textKey] as string) || undefined,
  });
  const setAudio = (clipKey: string, textKey: string) => (v: AudioValue) =>
    onConfigChange({ ...config, [clipKey]: v.clipId, [textKey]: v.text });

  if (node.type === "PLAY") {
    return (
      <AudioSourcePicker
        label="What callers hear"
        value={audioFor("clipId", "text")}
        onChange={setAudio("clipId", "text")}
        clips={clips}
        onClipsChange={onClipsChange}
      />
    );
  }

  if (node.type === "VOICEMAIL") {
    return (
      <div className="space-y-3">
        <AudioSourcePicker
          label="Voicemail greeting"
          value={audioFor("greetingClipId", "greetingText")}
          onChange={setAudio("greetingClipId", "greetingText")}
          clips={clips}
          onClipsChange={onClipsChange}
          textPlaceholder="e.g. You've reached Storm Sprinklers. Leave a message and we'll call back."
        />
        <div>
          <label className="mb-1 block text-sm font-medium">Max message length (seconds)</label>
          <Input
            type="number"
            min={30}
            max={600}
            value={Number(config.maxLengthSec ?? 120)}
            onChange={(e) =>
              onConfigChange({ ...config, maxLengthSec: Number(e.target.value) || 120 })
            }
          />
        </div>
      </div>
    );
  }

  if (node.type === "FORWARD") {
    return (
      <div>
        <label className="mb-1 block text-sm font-medium">Forward to number</label>
        <Input
          value={String(config.forwardTo ?? "")}
          onChange={(e) => onConfigChange({ ...config, forwardTo: e.target.value })}
          placeholder="+1 385 555 1234"
        />
      </div>
    );
  }

  if (node.type === "DIAL_GROUP") {
    return (
      <div>
        <label className="mb-1 block text-sm font-medium">Ring this team</label>
        <select
          className={selectClass}
          value={String(config.groupId ?? "")}
          onChange={(e) => onConfigChange({ ...config, groupId: e.target.value })}
        >
          <option value="">Default team</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (node.type === "DIAL_USER") {
    return (
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium">Ring this person</label>
          <select
            className={selectClass}
            value={String(config.userId ?? "")}
            onChange={(e) => onConfigChange({ ...config, userId: e.target.value })}
          >
            <option value="">Select a person…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            Rings their web softphone and iOS app (with a push notification when the app is closed).
          </p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Ring timeout (seconds)</label>
          <Input
            type="number"
            min={10}
            max={120}
            value={Number(config.timeoutSec ?? 30)}
            onChange={(e) =>
              onConfigChange({ ...config, timeoutSec: Number(e.target.value) || 30 })
            }
          />
        </div>
      </div>
    );
  }

  if (node.type === "IVR") {
    const options = (config.options as IvrOption[]) ?? [];
    return (
      <div className="space-y-3">
        <AudioSourcePicker
          label="Menu prompt"
          value={audioFor("promptClipId", "promptText")}
          onChange={setAudio("promptClipId", "promptText")}
          clips={clips}
          onClipsChange={onClipsChange}
          textPlaceholder="e.g. Press 1 for service, press 2 for billing."
        />
        <div>
          <p className="mb-2 text-sm font-medium">Digit options</p>
          {options.map((opt, optIdx) => (
            <div key={optIdx} className="mb-2 grid grid-cols-[3rem_1fr_1.5fr_auto] items-center gap-2">
              <Input
                value={opt.digit}
                onChange={(e) => {
                  const next = [...options];
                  next[optIdx] = { ...next[optIdx], digit: e.target.value };
                  onConfigChange({ ...config, options: next });
                }}
                placeholder="#"
                maxLength={1}
              />
              <Input
                value={opt.label}
                onChange={(e) => {
                  const next = [...options];
                  next[optIdx] = { ...next[optIdx], label: e.target.value };
                  onConfigChange({ ...config, options: next });
                }}
                placeholder="Label"
              />
              <select
                className={selectClass}
                value={opt.nextNodeId}
                onChange={(e) => {
                  const next = [...options];
                  next[optIdx] = { ...next[optIdx], nextNodeId: e.target.value };
                  onConfigChange({ ...config, options: next });
                }}
              >
                <option value="">Go to step…</option>
                {flow.nodes.map((n, i) =>
                  i === index || !n.id ? null : (
                    <option key={n.id} value={n.id}>
                      #{i + 1} {STEP_META[n.type].label}
                    </option>
                  )
                )}
              </select>
              <button
                type="button"
                onClick={() => {
                  const next = options.filter((_, i) => i !== optIdx);
                  onConfigChange({ ...config, options: next });
                }}
                className="rounded p-1.5 text-muted-foreground hover:bg-muted"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              onConfigChange({
                ...config,
                options: [...options, { digit: "", label: "", nextNodeId: "" }],
              })
            }
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add option
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Tip: “Go to step” only lists saved steps. Save the flow after adding steps to link them.
          </p>
        </div>
      </div>
    );
  }

  // QUEUE / HANGUP have no extra config.
  if (node.type === "QUEUE") {
    return (
      <p className="text-sm text-muted-foreground">
        {STEP_META.QUEUE.blurb}. Configure the required queue wait clip under{" "}
        <a href="/settings/voice" className="text-primary underline">
          Settings → Voice
        </a>
        .
      </p>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      {STEP_META[node.type].blurb}. No extra settings needed.
    </p>
  );
}
