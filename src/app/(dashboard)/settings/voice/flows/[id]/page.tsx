"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  CalendarClock,
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
import { Checkbox } from "@/components/ui/checkbox";
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
  | "HANGUP"
  | "HOURS_BRANCH";

type Branch = "open" | "closed";

type FlowNode = {
  id?: string;
  type: NodeType;
  config: Record<string, unknown>;
  sortOrder: number;
};

type IvrOption = { digit: string; label: string; nextNodeId: string };

type HoursRule = {
  id: string;
  label: string;
  days: number[];
  start: string;
  end: string;
  nextNodeId: string;
};

type CallFlow = {
  id: string;
  name: string;
  description: string | null;
  entryNodeId: string | null;
  afterHoursNodeId: string | null;
  nodes: FlowNode[];
};

type AgentGroup = {
  id: string;
  name: string;
  members?: Array<{ userId: string; user: { id: string; name: string } }>;
};
type CompanyUser = { id: string; name: string };
type PhoneNumber = {
  id: string;
  e164: string;
  friendlyName: string | null;
  callFlow: { id: string } | null;
};

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
  HOURS_BRANCH: {
    label: "Schedule branch",
    icon: CalendarClock,
    blurb: "Send callers down different paths by day and time",
  },
  HANGUP: { label: "End call", icon: PhoneOff, blurb: "Hang up" },
};

/** Schedule branch is legacy — hours are the top fork now. */
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

function nodeBranch(node: FlowNode): Branch {
  return node.config.branch === "closed" ? "closed" : "open";
}

function withBranch(config: Record<string, unknown>, branch: Branch): Record<string, unknown> {
  return { ...config, branch };
}

function defaultConfig(type: NodeType, branch: Branch = "open"): Record<string, unknown> {
  const base = (() => {
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
      case "QUEUE":
        return { voicemailDigit: "1", voicemailNodeId: "" };
      default:
        return {};
    }
  })();
  return withBranch(base, branch);
}

function reindex(nodes: FlowNode[]): FlowNode[] {
  return nodes.map((n, i) => ({ ...n, sortOrder: i }));
}

function orderByLanes(nodes: FlowNode[]): FlowNode[] {
  const open = nodes.filter((n) => nodeBranch(n) === "open");
  const closed = nodes.filter((n) => nodeBranch(n) === "closed");
  return reindex([...open, ...closed]);
}

/** Normalize legacy linear / schedule-branch flows into open|closed lanes. */
function migrateFlowForEditor(raw: CallFlow): CallFlow {
  let nodes = raw.nodes.map((n) => ({
    ...n,
    config: { ...(n.config as Record<string, unknown>) },
  }));

  const hoursNode = nodes.find((n) => n.type === "HOURS_BRANCH");
  if (hoursNode) {
    const rules = (hoursNode.config.rules as HoursRule[] | undefined) ?? [];
    const openId = rules[0]?.nextNodeId?.trim() || "";
    const closedId = String(hoursNode.config.defaultNextNodeId ?? "").trim();
    nodes = nodes.filter((n) => n.type !== "HOURS_BRANCH");
    nodes = nodes.map((n) => {
      if (n.id && n.id === closedId) {
        return { ...n, config: withBranch(n.config, "closed") };
      }
      if (n.id && n.id === openId) {
        return { ...n, config: withBranch(n.config, "open") };
      }
      return n;
    });
  }

  nodes = nodes.map((n) => ({
    ...n,
    config: withBranch(n.config, nodeBranch(n)),
  }));

  if (raw.afterHoursNodeId) {
    nodes = nodes.map((n) =>
      n.id === raw.afterHoursNodeId ? { ...n, config: withBranch(n.config, "closed") } : n
    );
  }

  return { ...raw, nodes: orderByLanes(nodes) };
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
    case "QUEUE": {
      const digit = String(config.voicemailDigit ?? "").trim();
      return digit ? `Hold · press ${digit} for voicemail` : "Hold with music";
    }
    case "HANGUP":
      return "Call will disconnect";
    default:
      return "";
  }
}

type ExpandKey = string;

function expandKey(branch: Branch, laneIndex: number): ExpandKey {
  return `${branch}:${laneIndex}`;
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
  const [expanded, setExpanded] = useState<ExpandKey | null>(null);
  const [addMenuAt, setAddMenuAt] = useState<string | null>(null);

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
        setFlow(migrateFlowForEditor(fl));
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

  const openNodes = useMemo(
    () => (flow ? flow.nodes.filter((n) => nodeBranch(n) === "open") : []),
    [flow]
  );
  const closedNodes = useMemo(
    () => (flow ? flow.nodes.filter((n) => nodeBranch(n) === "closed") : []),
    [flow]
  );

  function setOrderedNodes(open: FlowNode[], closed: FlowNode[]) {
    if (!flow) return;
    setFlow({ ...flow, nodes: orderByLanes([...open, ...closed]) });
  }

  function updateLaneNode(branch: Branch, laneIndex: number, patch: Partial<FlowNode>) {
    if (!flow) return;
    const open = [...openNodes];
    const closed = [...closedNodes];
    const lane = branch === "open" ? open : closed;
    lane[laneIndex] = { ...lane[laneIndex], ...patch };
    setOrderedNodes(open, closed);
  }

  function insertNode(branch: Branch, positionInLane: number, type: NodeType) {
    if (!flow) return;
    const open = [...openNodes];
    const closed = [...closedNodes];
    const lane = branch === "open" ? open : closed;
    lane.splice(positionInLane, 0, {
      type,
      config: defaultConfig(type, branch),
      sortOrder: 0,
    });
    setOrderedNodes(open, closed);
    setAddMenuAt(null);
    setExpanded(expandKey(branch, positionInLane));
  }

  function removeLaneNode(branch: Branch, laneIndex: number) {
    if (!flow) return;
    const open = [...openNodes];
    const closed = [...closedNodes];
    const lane = branch === "open" ? open : closed;
    const removed = lane[laneIndex];
    lane.splice(laneIndex, 1);
    setFlow({
      ...flow,
      nodes: orderByLanes([...open, ...closed]),
      entryNodeId: flow.entryNodeId === removed.id ? null : flow.entryNodeId,
      afterHoursNodeId: flow.afterHoursNodeId === removed.id ? null : flow.afterHoursNodeId,
    });
    setExpanded(null);
  }

  function moveLaneNode(branch: Branch, laneIndex: number, dir: -1 | 1) {
    if (!flow) return;
    const open = [...openNodes];
    const closed = [...closedNodes];
    const lane = branch === "open" ? open : closed;
    const target = laneIndex + dir;
    if (target < 0 || target >= lane.length) return;
    [lane[laneIndex], lane[target]] = [lane[target], lane[laneIndex]];
    setOrderedNodes(open, closed);
    setExpanded(expandKey(branch, target));
  }

  async function save() {
    if (!flow) return;
    setSaving(true);
    const ordered = orderByLanes(flow.nodes);
    const open = ordered.filter((n) => nodeBranch(n) === "open");
    const closed = ordered.filter((n) => nodeBranch(n) === "closed");
    const res = await fetch(`/api/settings/voice/flows/${flowId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: flow.name,
        description: flow.description,
        entryNodeId: open[0]?.id ?? null,
        afterHoursNodeId: closed[0]?.id ?? null,
        steps: ordered.map((n, i) => ({
          id: n.id,
          type: n.type,
          config: withBranch(n.config, nodeBranch(n)),
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
    setFlow(migrateFlowForEditor(updated));
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

  // Capture non-null flow for nested render helpers (TS does not narrow state across closures).
  const editorFlow = flow;

  const assignedNumbers = numbers.filter((n) => n.callFlow?.id === editorFlow.id);

  const AddStepControl = ({
    branch,
    position,
  }: {
    branch: Branch;
    position: number;
  }) => {
    const menuKey = `${branch}:${position}`;
    return (
      <div className="flex flex-col items-center">
        <div className="h-3 w-px bg-border" />
        {addMenuAt === menuKey ? (
          <div className="z-10 w-full rounded-lg border border-border bg-white p-2 shadow-sm">
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
                    onClick={() => insertNode(branch, position, t)}
                    className="flex items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>
                      <span className="block font-medium">{meta.label}</span>
                      <span className="block text-xs text-muted-foreground">{meta.blurb}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddMenuAt(menuKey)}
            className="rounded-full border border-primary/40 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/5"
          >
            Add step
          </button>
        )}
        <div className="h-3 w-px bg-border" />
      </div>
    );
  };

  function renderLane(branch: Branch, nodes: FlowNode[]) {
    const title = branch === "open" ? "Open hours" : "Closed / after hours";
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center">
        <div
          className={cn(
            "mb-1 w-full rounded-md px-2 py-1.5 text-center text-xs font-semibold",
            branch === "open"
              ? "bg-emerald-50 text-emerald-800"
              : "bg-slate-100 text-slate-700"
          )}
        >
          {title}
        </div>
        <AddStepControl branch={branch} position={0} />
        {nodes.map((node, laneIndex) => {
          const meta = STEP_META[node.type];
          const Icon = meta.icon;
          const key = expandKey(branch, laneIndex);
          const isOpen = expanded === key;
          return (
            <div key={node.id ?? `new-${branch}-${laneIndex}`} className="flex w-full flex-col items-center">
              <div className="w-full rounded-lg border border-border bg-white shadow-sm">
                <div className="flex items-center gap-2 p-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Icon className="h-4 w-4" />
                  </div>
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setExpanded(isOpen ? null : key)}
                  >
                    <p className="text-sm font-semibold">{meta.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {stepSummary(node, { groups, users, clips })}
                    </p>
                  </button>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => moveLaneNode(branch, laneIndex, -1)}
                      disabled={laneIndex === 0}
                      className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveLaneNode(branch, laneIndex, 1)}
                      disabled={laneIndex === nodes.length - 1}
                      className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeLaneNode(branch, laneIndex)}
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
                      flow={editorFlow}
                      groups={groups}
                      users={users}
                      clips={clips}
                      onClipsChange={setClips}
                      onGroupsChange={setGroups}
                      onNodeChange={(patch) => updateLaneNode(branch, laneIndex, patch)}
                    />
                  </div>
                ) : null}
              </div>
              <AddStepControl branch={branch} position={laneIndex + 1} />
            </div>
          );
        })}
        {nodes.length === 0 ? (
          <p className="px-2 pb-2 text-center text-xs text-muted-foreground">
            {branch === "open"
              ? "Add steps for when you are open."
              : "Optional. Leave empty to use the open path when closed."}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <ContentArea className="max-w-4xl">
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

        {/* Business hours fork hub */}
        <div className="w-full max-w-sm rounded-lg border border-border bg-white p-4 text-center shadow-sm">
          <div className="flex items-center justify-center gap-2 text-sm font-semibold">
            <CalendarClock className="h-4 w-4" />
            Business hours
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Callers follow the open path during company hours, or the closed path after hours.
          </p>
          <Link
            href="/settings/voice/hours"
            className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
          >
            Edit hours
          </Link>
        </div>

        {/* Y-split connectors */}
        <div className="relative h-8 w-full max-w-2xl">
          <div className="absolute left-1/2 top-0 h-3 w-px -translate-x-1/2 bg-border" />
          <div className="absolute left-[25%] right-[25%] top-3 h-px bg-border" />
          <div className="absolute left-[25%] top-3 h-5 w-px bg-border" />
          <div className="absolute right-[25%] top-3 h-5 w-px bg-border" />
        </div>

        {/* Side-by-side lanes */}
        <div className="grid w-full max-w-2xl grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-4">
          {renderLane("open", openNodes)}
          {renderLane("closed", closedNodes)}
        </div>

        <div className="mt-4 h-4 w-px bg-border" />

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
  flow,
  groups,
  users,
  clips,
  onClipsChange,
  onGroupsChange,
  onNodeChange,
}: {
  node: FlowNode;
  flow: CallFlow;
  groups: AgentGroup[];
  users: CompanyUser[];
  clips: VoiceClip[];
  onClipsChange: (clips: VoiceClip[]) => void;
  onGroupsChange: (groups: AgentGroup[]) => void;
  onNodeChange: (patch: Partial<FlowNode>) => void;
}) {
  const config = node.config;
  const branch = nodeBranch(node);

  const onConfigChange = (next: Record<string, unknown>) =>
    onNodeChange({ config: withBranch(next, branch) });

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

  if (node.type === "DIAL_USER" || node.type === "DIAL_GROUP") {
    return (
      <RingStepEditor
        node={node}
        groups={groups}
        users={users}
        onGroupsChange={onGroupsChange}
        onNodeChange={onNodeChange}
      />
    );
  }

  if (node.type === "IVR") {
    const options = (config.options as IvrOption[]) ?? [];
    const sameBranchNodes = flow.nodes.filter(
      (n) => n.id && n !== node && nodeBranch(n) === branch
    );
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
            <div
              key={optIdx}
              className="mb-2 grid grid-cols-[3rem_1fr_1.5fr_auto] items-center gap-2"
            >
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
                {sameBranchNodes.map((n) => {
                  const i = flow.nodes.indexOf(n);
                  return (
                    <option key={n.id} value={n.id}>
                      #{i + 1} {STEP_META[n.type].label}
                    </option>
                  );
                })}
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
            Tip: “Go to step” only lists saved steps in this path. Save the flow after adding steps
            to link them.
          </p>
        </div>
      </div>
    );
  }

  if (node.type === "QUEUE") {
    const saved = flow.nodes.filter((n) => n.id && nodeBranch(n) === branch);
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Queue wait music is set under{" "}
          <a href="/settings/voice" className="text-primary underline">
            Settings → Voice
          </a>
          .
        </p>
        <div>
          <label className="mb-1 block text-sm font-medium">
            Key to leave a voicemail (optional)
          </label>
          <Input
            value={String(config.voicemailDigit ?? "")}
            onChange={(e) =>
              onConfigChange({
                ...config,
                voicemailDigit: e.target.value.replace(/[^\d*#]/g, "").slice(0, 1),
              })
            }
            placeholder="e.g. 1"
            maxLength={1}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            While waiting, the caller can press this key to leave the queue and record a message.
            Leave blank to disable.
          </p>
        </div>
        {String(config.voicemailDigit ?? "").trim() ? (
          <div>
            <label className="mb-1 block text-sm font-medium">Voicemail step</label>
            <select
              className={selectClass}
              value={String(config.voicemailNodeId ?? "")}
              onChange={(e) => onConfigChange({ ...config, voicemailNodeId: e.target.value })}
            >
              <option value="">Default company voicemail</option>
              {saved
                .filter(
                  (n) => n.type === "VOICEMAIL" || n.type === "PLAY" || n.type === "HANGUP"
                )
                .map((n) => {
                  const i = flow.nodes.indexOf(n);
                  return (
                    <option key={n.id} value={n.id ?? ""}>
                      #{i + 1} {STEP_META[n.type].label}
                    </option>
                  );
                })}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              Save the flow after adding a Voicemail step to select it here.
            </p>
          </div>
        ) : null}
      </div>
    );
  }

  // Legacy HOURS_BRANCH (should be migrated away on load)
  if (node.type === "HOURS_BRANCH") {
    return (
      <p className="text-sm text-muted-foreground">
        This schedule branch is legacy. Save the flow to convert it into the open/closed paths
        above.
      </p>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      {STEP_META[node.type].blurb}. No extra settings needed.
    </p>
  );
}

function RingStepEditor({
  node,
  groups,
  users,
  onGroupsChange,
  onNodeChange,
}: {
  node: FlowNode;
  groups: AgentGroup[];
  users: CompanyUser[];
  onGroupsChange: (groups: AgentGroup[]) => void;
  onNodeChange: (patch: Partial<FlowNode>) => void;
}) {
  const branch = nodeBranch(node);
  const config = node.config;
  const [pendingUserIds, setPendingUserIds] = useState<string[]>([]);
  const [upgradeName, setUpgradeName] = useState("");
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [manualCreateOpen, setManualCreateOpen] = useState(false);
  const [manualName, setManualName] = useState("");
  const [createMemberIds, setCreateMemberIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

  const selectedGroup = groups.find((g) => g.id === config.groupId);

  useEffect(() => {
    if (node.type === "DIAL_USER") {
      const uid = String(config.userId ?? "");
      setPendingUserIds(uid ? [uid] : []);
      setShowUpgrade(false);
    } else if (node.type === "DIAL_GROUP" && selectedGroup?.members) {
      setPendingUserIds(selectedGroup.members.map((m) => m.userId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.type, config.userId, config.groupId, selectedGroup?.id]);

  function applyAsUser(userId: string) {
    onNodeChange({
      type: "DIAL_USER",
      config: withBranch(
        { userId, timeoutSec: Number(config.timeoutSec ?? 30) },
        branch
      ),
    });
  }

  async function createTeam(name: string, memberUserIds: string[]) {
    const res = await fetch("/api/settings/voice/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim() || "Call flow team",
        ringStrategy: "SIMULTANEOUS",
        ringTimeoutSec: Number(config.timeoutSec ?? 30),
        memberUserIds,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to create team");
    }
    return (await res.json()) as AgentGroup;
  }

  async function upgradeToTeam(memberUserIds: string[], name: string) {
    setUpgrading(true);
    try {
      const group = await createTeam(name, memberUserIds);
      onGroupsChange([group, ...groups.filter((g) => g.id !== group.id)]);
      onNodeChange({
        type: "DIAL_GROUP",
        config: withBranch(
          { groupId: group.id, timeoutSec: Number(config.timeoutSec ?? 30) },
          branch
        ),
      });
      setShowUpgrade(false);
      setUpgradeName("");
      toast.success(`Created team “${group.name}”`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create team");
    } finally {
      setUpgrading(false);
    }
  }

  async function handleCreateTeamSubmit() {
    if (createMemberIds.length === 0) {
      toast.error("Select at least one person");
      return;
    }
    setCreating(true);
    try {
      const group = await createTeam(manualName || "Call flow team", createMemberIds);
      onGroupsChange([group, ...groups.filter((g) => g.id !== group.id)]);
      onNodeChange({
        type: "DIAL_GROUP",
        config: withBranch(
          { groupId: group.id, timeoutSec: Number(config.timeoutSec ?? 30) },
          branch
        ),
      });
      setManualName("");
      setCreateMemberIds([]);
      setManualCreateOpen(false);
      toast.success(`Created team “${group.name}”`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create team");
    } finally {
      setCreating(false);
    }
  }

  function addPerson(userId: string) {
    if (!userId || pendingUserIds.includes(userId)) return;
    const next = [...pendingUserIds, userId];
    setPendingUserIds(next);

    if (next.length === 1) {
      applyAsUser(next[0]);
      return;
    }

    if (next.length >= 2 && node.type === "DIAL_USER") {
      const names = next
        .map((id) => users.find((u) => u.id === id)?.name)
        .filter(Boolean)
        .slice(0, 2)
        .join(" & ");
      setUpgradeName(names ? `${names} team` : "Call flow team");
      setShowUpgrade(true);
      setManualCreateOpen(false);
      return;
    }

    if (node.type === "DIAL_GROUP" && config.groupId) {
      void (async () => {
        const res = await fetch(`/api/settings/voice/groups/${config.groupId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memberUserIds: next }),
        });
        if (!res.ok) {
          toast.error("Failed to update team members");
          return;
        }
        const updated = (await res.json()) as AgentGroup;
        onGroupsChange(groups.map((g) => (g.id === updated.id ? updated : g)));
      })();
    }
  }

  function removePerson(userId: string) {
    const next = pendingUserIds.filter((id) => id !== userId);
    setPendingUserIds(next);
    setShowUpgrade(false);

    if (next.length === 0) {
      onNodeChange({
        type: "DIAL_USER",
        config: withBranch({ userId: "", timeoutSec: Number(config.timeoutSec ?? 30) }, branch),
      });
      return;
    }

    if (next.length === 1) {
      applyAsUser(next[0]);
      return;
    }

    if (node.type === "DIAL_GROUP" && config.groupId) {
      void (async () => {
        const res = await fetch(`/api/settings/voice/groups/${config.groupId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memberUserIds: next }),
        });
        if (!res.ok) {
          toast.error("Failed to update team members");
          return;
        }
        const updated = (await res.json()) as AgentGroup;
        onGroupsChange(groups.map((g) => (g.id === updated.id ? updated : g)));
      })();
    }
  }

  const availableToAdd = users.filter((u) => !pendingUserIds.includes(u.id));

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-sm font-medium">
          {node.type === "DIAL_GROUP" ? "Ring this team" : "Ring these people"}
        </label>
        {node.type === "DIAL_GROUP" ? (
          <select
            className={cn(selectClass, "mb-2")}
            value={String(config.groupId ?? "")}
            onChange={(e) =>
              onNodeChange({
                type: "DIAL_GROUP",
                config: withBranch({ groupId: e.target.value, timeoutSec: Number(config.timeoutSec ?? 30) }, branch),
              })
            }
          >
            <option value="">Default team</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        ) : null}

        <div className="mb-2 flex flex-wrap gap-1.5">
          {pendingUserIds.map((id) => {
            const u = users.find((x) => x.id === id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium"
              >
                {u?.name ?? "Unknown"}
                <button
                  type="button"
                  onClick={() => removePerson(id)}
                  className="rounded-full p-0.5 hover:bg-background"
                  aria-label={`Remove ${u?.name ?? "person"}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
          {pendingUserIds.length === 0 ? (
            <span className="text-xs text-muted-foreground">No one selected yet</span>
          ) : null}
        </div>

        {availableToAdd.length > 0 ? (
          <select
            className={selectClass}
            value=""
            onChange={(e) => {
              addPerson(e.target.value);
            }}
          >
            <option value="">Add a person…</option>
            {availableToAdd.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        ) : null}

        <p className="mt-1 text-xs text-muted-foreground">
          Add a second person to ring as a team. Rings web softphone and iOS app.
        </p>
      </div>

      {showUpgrade && pendingUserIds.length >= 2 ? (
        <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
          <p className="text-sm font-medium">Save as a team</p>
          <Input
            value={upgradeName}
            onChange={(e) => setUpgradeName(e.target.value)}
            placeholder="Team name"
          />
          <Button
            type="button"
            size="sm"
            disabled={upgrading}
            onClick={() => void upgradeToTeam(pendingUserIds, upgradeName)}
          >
            {upgrading ? "Creating…" : "Create team & ring them"}
          </Button>
        </div>
      ) : null}

      <div>
        <button
          type="button"
          className="text-xs font-medium text-primary hover:underline"
          onClick={() => {
            setManualCreateOpen((v) => !v);
            setShowUpgrade(false);
            if (!manualCreateOpen) {
              setCreateMemberIds(pendingUserIds.length ? pendingUserIds : []);
              setManualName("");
            }
          }}
        >
          {manualCreateOpen ? "Cancel new team" : "Create new team…"}
        </button>
        {manualCreateOpen ? (
          <div className="mt-2 space-y-2 rounded-md border border-border p-3">
            <Input
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="Team name"
            />
            <div className="max-h-40 space-y-1.5 overflow-y-auto">
              {users.map((u) => {
                const checked = createMemberIds.includes(u.id);
                return (
                  <label key={u.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) =>
                        setCreateMemberIds((prev) =>
                          v ? [...prev, u.id] : prev.filter((id) => id !== u.id)
                        )
                      }
                    />
                    {u.name}
                  </label>
                );
              })}
            </div>
            <Button
              type="button"
              size="sm"
              disabled={creating}
              onClick={() => void handleCreateTeamSubmit()}
            >
              {creating ? "Creating…" : "Create team"}
            </Button>
          </div>
        ) : null}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Ring timeout (seconds)</label>
        <Input
          type="number"
          min={10}
          max={120}
          value={Number(config.timeoutSec ?? 30)}
          onChange={(e) =>
            onNodeChange({
              type: node.type,
              config: withBranch(
                { ...config, timeoutSec: Number(e.target.value) || 30 },
                branch
              ),
            })
          }
        />
      </div>
    </div>
  );
}
