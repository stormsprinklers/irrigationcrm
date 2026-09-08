"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Clock,
  GitBranch,
  Mail,
  MessageSquare,
  Tag,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmailCampaignEditor } from "@/components/marketing/EmailCampaignEditor";
import { InsertVariableButton, applyTokenToInput } from "@/components/communications/InsertVariableButton";
import { IfElseBranchEditor } from "@/components/marketing/IfElseBranchEditor";
import { BranchFork, PanCanvas, VerticalConnector } from "@/components/flow-canvas/PanCanvas";
import type { CampaignFlowNodeInput, CampaignFlowNodeType } from "@/lib/marketing/types";
import {
  IF_ELSE_MAX_BRANCHES,
  branchPreview,
  defaultIfElseConfig,
  emptyIfElseBranch,
  ifElseSummary,
  parseIfElseConfig,
  scrubIfElseNextIds,
} from "@/lib/marketing/if-else";
import { cn } from "@/lib/utils";
import {
  parseWaitConfig,
  waitSummary,
  type WaitAction,
  type WaitDurationUnit,
  type WaitMode,
} from "@/lib/marketing/wait-config";
import {
  campaignDatetimeLocalValue,
  campaignStartDateInputValue,
} from "@/lib/marketing/campaign-time";
import { addTagSummary, parseAddTagConfig } from "@/lib/marketing/add-tag";

type Props = {
  nodes: CampaignFlowNodeInput[];
  onChange: (nodes: CampaignFlowNodeInput[]) => void;
  emailsPerDay: number;
  smsPerDay: number;
  startAt?: string;
  onSettingsChange: (settings: {
    emailsPerDay: number;
    smsPerDay: number;
    startAt?: string;
  }) => void;
};

const NODE_META: Record<
  CampaignFlowNodeType,
  {
    label: string;
    icon: typeof Mail;
    blurb: string;
    tone: string;
    iconTone: string;
  }
> = {
  TRIGGER: {
    label: "Enrollment trigger",
    icon: Zap,
    blurb: "When someone enters this campaign",
    tone: "border-amber-200",
    iconTone: "bg-amber-100 text-amber-700",
  },
  WAIT: {
    label: "Wait",
    icon: Clock,
    blurb: "Time, date, reply, or email action",
    tone: "border-slate-200",
    iconTone: "bg-slate-100 text-slate-700",
  },
  SEND_EMAIL: {
    label: "Send email",
    icon: Mail,
    blurb: "Email this customer",
    tone: "border-sky-200",
    iconTone: "bg-sky-100 text-sky-700",
  },
  SEND_SMS: {
    label: "Send SMS",
    icon: MessageSquare,
    blurb: "Text this customer",
    tone: "border-emerald-200",
    iconTone: "bg-emerald-100 text-emerald-700",
  },
  ADD_TAG: {
    label: "Add tag",
    icon: Tag,
    blurb: "Apply a tag to this customer",
    tone: "border-violet-200",
    iconTone: "bg-violet-100 text-violet-700",
  },
  BRANCH: {
    label: "If/Else",
    icon: GitBranch,
    blurb: "Fork the contact journey through this workflow based on conditions",
    tone: "border-orange-200",
    iconTone: "bg-orange-100 text-orange-700",
  },
  EXIT: {
    label: "Exit",
    icon: Trash2,
    blurb: "Leave the campaign",
    tone: "border-rose-200",
    iconTone: "bg-rose-100 text-rose-700",
  },
};

const ADDABLE_TYPES: CampaignFlowNodeType[] = [
  "WAIT",
  "SEND_EMAIL",
  "SEND_SMS",
  "ADD_TAG",
  "BRANCH",
  "EXIT",
];

function newId() {
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createNode(
  type: CampaignFlowNodeType,
  sortOrder: number
): CampaignFlowNodeInput & { id: string } {
  const id = newId();
  return { id, type, sortOrder, config: defaultConfig(type) };
}

function defaultConfig(type: CampaignFlowNodeType): Record<string, unknown> {
  switch (type) {
    case "TRIGGER":
      return {
        kind: "manual_audience",
        // Also support: job_completed, form_no_booking, city
        jobValueMin: undefined,
        jobValueMax: undefined,
        priceBookItemIds: [],
        cities: [],
        formNoBookingDays: 7,
      };
    case "WAIT":
      return {
        mode: "delay",
        delayAmount: 1,
        delayUnit: "days",
        sendAt: undefined,
        replyKeyword: "",
        action: "opened",
      };
    case "SEND_EMAIL":
      return { subject: "", bodyHtml: "", bodyText: "", aiPrompt: "" };
    case "SEND_SMS":
      return { bodyText: "" };
    case "ADD_TAG":
      return { tags: [] };
    case "BRANCH":
      return defaultIfElseConfig();
    case "EXIT":
      return {};
    default:
      return {};
  }
}

type FlowEdge = {
  key: string;
  label: string;
  nextId: string;
  kind: "linear" | "branch" | "none";
};

function ensureNodeId(node: CampaignFlowNodeInput): string {
  return node.id || `tmp-${node.sortOrder}`;
}

function linearNext(nodes: CampaignFlowNodeInput[], nodeId: string) {
  const idx = nodes.findIndex((n) => ensureNodeId(n) === nodeId);
  if (idx < 0) return null;
  return nodes[idx + 1] ?? null;
}

function outgoingEdges(node: CampaignFlowNodeInput, nodes: CampaignFlowNodeInput[]): FlowEdge[] {
  if (node.type === "EXIT") return [];
  if (node.type === "BRANCH") {
    const parsed = parseIfElseConfig(node.config);
    return [
      ...parsed.branches.map((branch, index) => ({
        key: branch.id,
        label: branchPreview(branch) || `Branch ${index + 1}`,
        nextId: branch.nextId,
        kind: "branch" as const,
      })),
      {
        key: "none",
        label: "None",
        nextId: parsed.noneNextId,
        kind: "none" as const,
      },
    ];
  }
  const next = linearNext(nodes, ensureNodeId(node));
  return [
    {
      key: "continue",
      label: "Continue",
      nextId: next ? ensureNodeId(next) : "",
      kind: "linear",
    },
  ];
}

function nodeCardSummary(node: CampaignFlowNodeInput, timezone: string) {
  if (node.type === "WAIT") return waitSummary(node.config, timezone);
  if (node.type === "BRANCH") return ifElseSummary(node.config);
  if (node.type === "ADD_TAG") return addTagSummary(node.config);
  if (node.type === "SEND_EMAIL") {
    const subject = String(node.config.subject ?? "").trim();
    return subject || NODE_META.SEND_EMAIL.blurb;
  }
  if (node.type === "SEND_SMS") {
    const body = String(node.config.bodyText ?? "").trim();
    return body ? body.slice(0, 72) : NODE_META.SEND_SMS.blurb;
  }
  if (node.type === "TRIGGER") {
    const kind = String(node.config.kind ?? "manual_audience");
    if (kind === "job_completed") return "When a visit is completed";
    if (kind === "form_no_booking") return "Form filled, no appointment";
    if (kind === "city") return "Customer city matches";
    return "When the campaign is activated";
  }
  return NODE_META[node.type].blurb;
}

function AddStepMenu({
  onPick,
}: {
  onPick: (type: CampaignFlowNodeType) => void;
}) {
  return (
    <div className="mt-2 flex max-w-[16rem] flex-wrap justify-center gap-1">
      {ADDABLE_TYPES.map((type) => (
        <Button
          key={type}
          type="button"
          size="sm"
          variant="secondary"
          className="h-7 px-2 text-xs"
          onClick={() => onPick(type)}
        >
          + {NODE_META[type].label}
        </Button>
      ))}
    </div>
  );
}

export function CampaignFlowEditor({
  nodes,
  onChange,
  emailsPerDay,
  smsPerDay,
  startAt,
  onSettingsChange,
}: Props) {
  const [selectionId, setSelectionId] = useState<string | null>(nodes[0] ? ensureNodeId(nodes[0]) : null);
  const [zoom, setZoom] = useState(1);
  const [timezone, setTimezone] = useState("America/Denver");

  useEffect(() => {
    fetch("/api/settings/company")
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.timezone === "string" && data.timezone.trim()) {
          setTimezone(data.timezone.trim());
        }
      })
      .catch(() => {});
  }, []);

  const byId = useMemo(() => {
    const map = new Map<string, CampaignFlowNodeInput>();
    for (const node of nodes) map.set(ensureNodeId(node), node);
    return map;
  }, [nodes]);

  const startId =
    nodes.find((n) => n.type === "TRIGGER") ? ensureNodeId(nodes.find((n) => n.type === "TRIGGER")!) : nodes[0] ? ensureNodeId(nodes[0]) : null;

  const primaryParent = useMemo(() => {
    const parent = new Map<string, string>();
    if (!startId) return parent;
    const queue = [startId];
    const seen = new Set<string>();
    while (queue.length) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const node = byId.get(id);
      if (!node) continue;
      for (const edge of outgoingEdges(node, nodes)) {
        if (!edge.nextId || !byId.has(edge.nextId)) continue;
        if (!parent.has(edge.nextId)) {
          parent.set(edge.nextId, id);
          queue.push(edge.nextId);
        }
      }
    }
    return parent;
  }, [byId, nodes, startId]);

  const reachable = useMemo(() => {
    const seen = new Set<string>();
    const walk = (id: string | null) => {
      if (!id || seen.has(id)) return;
      const node = byId.get(id);
      if (!node) return;
      seen.add(id);
      for (const edge of outgoingEdges(node, nodes)) walk(edge.nextId || null);
    };
    walk(startId);
    return seen;
  }, [byId, nodes, startId]);

  const orphans = nodes.filter((n) => !reachable.has(ensureNodeId(n)));
  const selected = selectionId ? byId.get(selectionId) ?? null : null;

  function reindex(list: CampaignFlowNodeInput[]) {
    return list.map((n, i) => ({ ...n, sortOrder: i }));
  }

  function setConfigFor(id: string, config: Record<string, unknown>) {
    onChange(nodes.map((n) => (ensureNodeId(n) === id ? { ...n, config } : n)));
  }

  function removeNode(id: string) {
    const next = reindex(
      nodes
        .filter((n) => ensureNodeId(n) !== id)
        .map((n) => ({ ...n, config: scrubIfElseNextIds(n.config, id) }))
    );
    onChange(next);
    setSelectionId((prev) => (prev === id ? next[0] ? ensureNodeId(next[0]) : null : prev));
  }

  function insertAfter(parentId: string, type: CampaignFlowNodeType) {
    const idx = nodes.findIndex((n) => ensureNodeId(n) === parentId);
    if (idx < 0) return;
    const child = createNode(type, idx + 1);
    onChange(reindex([...nodes.slice(0, idx + 1), child, ...nodes.slice(idx + 1)]));
    setSelectionId(child.id);
  }

  function addFromBranch(
    parentId: string,
    edgeKey: string,
    type: CampaignFlowNodeType
  ) {
    const parent = byId.get(parentId);
    if (!parent || parent.type !== "BRANCH") return;
    const child = createNode(type, nodes.length);
    const parsed = parseIfElseConfig(parent.config);
    const nextConfig =
      edgeKey === "none"
        ? { ...parsed, noneNextId: child.id }
        : {
            ...parsed,
            branches: parsed.branches.map((branch) =>
              branch.id === edgeKey ? { ...branch, nextId: child.id } : branch
            ),
          };
    onChange(
      reindex(
        nodes
          .map((n) => (ensureNodeId(n) === parentId ? { ...n, config: nextConfig } : n))
          .concat(child)
      )
    );
    setSelectionId(child.id);
  }

  function addIfElseBranch(parentId: string) {
    const parent = byId.get(parentId);
    if (!parent || parent.type !== "BRANCH") return;
    const parsed = parseIfElseConfig(parent.config);
    if (parsed.branches.length >= IF_ELSE_MAX_BRANCHES) return;
    setConfigFor(parentId, { ...parsed, branches: [...parsed.branches, emptyIfElseBranch()] });
  }

  function renderJump(nextId: string) {
    const target = byId.get(nextId);
    if (!target) return null;
    return (
      <div className="mt-1 flex flex-col items-center">
        <VerticalConnector />
        <button
          type="button"
          className="max-w-[14rem] rounded-full border border-dashed border-sky-400 bg-sky-50/80 px-3 py-1.5 text-center text-xs font-medium text-sky-900 hover:bg-sky-100"
          onClick={(e) => {
            e.stopPropagation();
            setSelectionId(nextId);
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          → {NODE_META[target.type].label}
        </button>
      </div>
    );
  }

  function renderNode(
    nodeId: string,
    pathSeen: Set<string>,
    rendered: Set<string>
  ): ReactNode {
    const node = byId.get(nodeId);
    if (!node) return null;
    if (pathSeen.has(nodeId) || rendered.has(nodeId)) return null;
    rendered.add(nodeId);
    const nextSeen = new Set(pathSeen);
    nextSeen.add(nodeId);
    const meta = NODE_META[node.type];
    const Icon = meta.icon;
    const selectedCard = selectionId === nodeId;
    const edges = outgoingEdges(node, nodes);

    return (
      <div key={nodeId} className="relative z-[1] flex w-max flex-col items-center">
        <button
          type="button"
          className={cn(
            "relative z-[1] w-64 rounded-lg border bg-white p-3 text-left shadow-sm transition-shadow",
            meta.tone,
            selectedCard && "ring-2 ring-primary ring-offset-2"
          )}
          onClick={() => setSelectionId(nodeId)}
        >
          <span className="flex items-start gap-3">
            <span
              className={cn(
                "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                meta.iconTone
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {meta.label}
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {nodeCardSummary(node, timezone)}
              </span>
            </span>
          </span>
        </button>

        {node.type === "EXIT" ? null : edges.length === 1 && edges[0].kind === "linear" ? (
          <div className="flex w-max flex-col items-center">
            {edges[0].nextId && byId.has(edges[0].nextId) ? (
              primaryParent.get(edges[0].nextId) === nodeId ? (
                <>
                  <VerticalConnector taller />
                  {renderNode(edges[0].nextId, nextSeen, rendered)}
                </>
              ) : (
                renderJump(edges[0].nextId)
              )
            ) : (
              <>
                <VerticalConnector />
                <AddStepMenu onPick={(type) => insertAfter(nodeId, type)} />
              </>
            )}
          </div>
        ) : (
          <BranchFork
            columns={[
              ...edges.map((edge) => (
                <div key={edge.key} className="flex w-max flex-col items-center">
                  <button
                    type="button"
                    className={cn(
                      "mb-1 max-w-[14rem] rounded-full border px-3 py-1.5 text-center text-xs font-medium",
                      edge.kind === "none"
                        ? "border-border bg-muted/50"
                        : "border-sky-200 bg-sky-50 text-sky-900"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectionId(nodeId);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    {edge.label}
                  </button>
                  {edge.nextId && byId.has(edge.nextId) ? (
                    primaryParent.get(edge.nextId) === nodeId ? (
                      <>
                        <VerticalConnector />
                        {renderNode(edge.nextId, nextSeen, rendered)}
                      </>
                    ) : (
                      renderJump(edge.nextId)
                    )
                  ) : (
                    <>
                      <VerticalConnector />
                      <AddStepMenu onPick={(type) => addFromBranch(nodeId, edge.key, type)} />
                    </>
                  )}
                </div>
              )),
              ...(node.type === "BRANCH" &&
              parseIfElseConfig(node.config).branches.length < IF_ELSE_MAX_BRANCHES
                ? [
                    <div key="add-branch" className="flex w-max flex-col items-center">
                      <button
                        type="button"
                        className="mb-1 max-w-[14rem] rounded-full border border-dashed border-sky-300 bg-sky-50/50 px-3 py-1.5 text-center text-xs font-medium text-sky-800 hover:bg-sky-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          addIfElseBranch(nodeId);
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        + Add branch
                      </button>
                    </div>,
                  ]
                : []),
            ]}
          />
        )}
      </div>
    );
  }

  const treeRendered = new Set<string>();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid shrink-0 gap-3 border-b border-border bg-card px-4 py-3 sm:grid-cols-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Emails per day</label>
          <Input
            type="number"
            className="mt-1 h-8"
            value={emailsPerDay}
            onChange={(e) =>
              onSettingsChange({
                emailsPerDay: Number(e.target.value) || 0,
                smsPerDay,
                startAt,
              })
            }
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">SMS per day</label>
          <Input
            type="number"
            className="mt-1 h-8"
            value={smsPerDay}
            onChange={(e) =>
              onSettingsChange({
                emailsPerDay,
                smsPerDay: Number(e.target.value) || 0,
                startAt,
              })
            }
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Start date ({timezone})</label>
          <Input
            type="date"
            className="mt-1 h-8"
            value={campaignStartDateInputValue(startAt, timezone)}
            onChange={(e) =>
              onSettingsChange({
                emailsPerDay,
                smsPerDay,
                startAt: e.target.value || undefined,
              })
            }
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-h-0 min-w-0 flex-1">
          <PanCanvas zoom={zoom} onZoomChange={setZoom}>
            <div className="relative flex flex-col items-center">
              <div className="w-full max-w-sm rounded-lg border border-border bg-background/90 p-4 text-center shadow-sm">
                <p className="text-sm font-semibold">Campaign start</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Contacts begin at the enrollment trigger, then follow this path.
                </p>
              </div>
              {startId ? (
                <>
                  <VerticalConnector taller />
                  {renderNode(startId, new Set(), treeRendered)}
                </>
              ) : (
                <div className="mt-4 flex flex-col items-center">
                  <VerticalConnector />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const node = createNode("TRIGGER", 0);
                      onChange([node]);
                      setSelectionId(node.id);
                    }}
                  >
                    Add enrollment trigger
                  </Button>
                </div>
              )}
              {orphans.length > 0 ? (
                <div className="mt-8 w-full max-w-5xl rounded-lg border border-dashed border-border p-4">
                  <p className="mb-3 text-sm font-medium">Unused steps</p>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Not reachable from the start. Connect them from If/Else, or delete them.
                  </p>
                  <div className="flex flex-col items-center gap-4">
                    {orphans.map((node) =>
                      renderNode(ensureNodeId(node), new Set(), treeRendered)
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </PanCanvas>
        </div>

        {selected ? (
          <aside className="flex w-[min(28rem,46vw)] shrink-0 flex-col border-l border-border bg-background">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {NODE_META[selected.type].label}
                </p>
                <h3 className="font-semibold text-foreground">Edit step</h3>
              </div>
              <div className="flex items-center gap-1">
                {selected.type !== "TRIGGER" || nodes.length > 1 ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Delete step"
                    onClick={() => removeNode(ensureNodeId(selected))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Close"
                  onClick={() => setSelectionId(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              <NodeConfigEditor
                node={selected}
                allNodes={nodes}
                otherNodes={nodes.filter((n) => ensureNodeId(n) !== ensureNodeId(selected))}
                timezone={timezone}
                onConfigChange={(config) => setConfigFor(ensureNodeId(selected), config)}
              />
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function labelForId(id: string, nodes: CampaignFlowNodeInput[]) {
  const idx = nodes.findIndex((n) => n.id === id);
  if (idx < 0) return "";
  return `#${idx + 1} ${NODE_META[nodes[idx].type].label}`;
}

function DurationFields({
  amount,
  unit,
  onChange,
}: {
  amount: number;
  unit: WaitDurationUnit;
  onChange: (amount: number, unit: WaitDurationUnit) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_8rem] gap-2">
      <Input
        type="number"
        min={0}
        className="mt-1"
        value={amount}
        onChange={(e) => onChange(Number(e.target.value) || 0, unit)}
      />
      <select
        className="mt-1 flex h-10 rounded-md border border-input bg-transparent px-2 text-sm"
        value={unit}
        onChange={(e) => onChange(amount, e.target.value as WaitDurationUnit)}
      >
        <option value="minutes">Minutes</option>
        <option value="hours">Hours</option>
        <option value="days">Days</option>
      </select>
    </div>
  );
}

function AddTagConfigEditor({
  config,
  onConfigChange,
}: {
  config: Record<string, unknown>;
  onConfigChange: (config: Record<string, unknown>) => void;
}) {
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const tags = parseAddTagConfig(config);

  useEffect(() => {
    fetch("/api/marketing/audience/filters")
      .then((res) => res.json())
      .then((data) => setAvailableTags(Array.isArray(data.tags) ? data.tags : []))
      .catch(() => {});
  }, []);

  function addTag(value: string) {
    const next = parseAddTagConfig({ tags: [...tags, value] });
    onConfigChange({ ...config, tags: next, tag: undefined });
    setTagInput("");
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm font-medium">Tag to add</label>
        <p className="mt-0.5 text-xs text-muted-foreground">
          When a contact reaches this step, these tags are applied to their customer record.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1 pr-1">
            {tag}
            <button
              type="button"
              onClick={() =>
                onConfigChange({
                  ...config,
                  tags: tags.filter((item) => item !== tag),
                  tag: undefined,
                })
              }
              aria-label={`Remove ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          list="campaign-add-tags"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          placeholder="vip, holiday, follow-up…"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag(tagInput);
            }
          }}
        />
        <Button type="button" variant="outline" onClick={() => addTag(tagInput)}>
          Add
        </Button>
      </div>
      <datalist id="campaign-add-tags">
        {availableTags.map((tag) => (
          <option key={tag} value={tag} />
        ))}
      </datalist>
    </div>
  );
}

function NodeConfigEditor({
  node,
  allNodes,
  otherNodes,
  timezone,
  onConfigChange,
}: {
  node: CampaignFlowNodeInput;
  allNodes: CampaignFlowNodeInput[];
  otherNodes: CampaignFlowNodeInput[];
  timezone: string;
  onConfigChange: (config: Record<string, unknown>) => void;
}) {
  const smsRef = useRef<HTMLTextAreaElement>(null);
  const config = node.config;

  if (node.type === "TRIGGER") {
    const kind = String(config.kind ?? "manual_audience");
    return (
      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium">How customers enter</label>
          <select
            className="mt-1 flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={kind}
            onChange={(e) => onConfigChange({ ...config, kind: e.target.value })}
          >
            <option value="manual_audience">When campaign is activated (audience filters)</option>
            <option value="job_completed">Visit completed</option>
            <option value="form_no_booking">Form filled, no appointment</option>
            <option value="city">Customer city matches</option>
          </select>
        </div>
        {kind === "job_completed" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-muted-foreground">Min visit value ($)</label>
              <Input
                type="number"
                className="mt-1"
                value={Number(config.jobValueMin ?? "") || ""}
                onChange={(e) =>
                  onConfigChange({
                    ...config,
                    jobValueMin: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Max visit value ($)</label>
              <Input
                type="number"
                className="mt-1"
                value={Number(config.jobValueMax ?? "") || ""}
                onChange={(e) =>
                  onConfigChange({
                    ...config,
                    jobValueMax: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">
                Line item name contains (optional)
              </label>
              <Input
                className="mt-1"
                value={String(config.lineItemContains ?? "")}
                onChange={(e) =>
                  onConfigChange({ ...config, lineItemContains: e.target.value })
                }
                placeholder="e.g. Backflow"
              />
            </div>
          </div>
        ) : null}
        {kind === "city" ? (
          <div>
            <label className="text-xs text-muted-foreground">Cities (comma-separated)</label>
            <Input
              className="mt-1"
              value={(config.cities as string[] | undefined)?.join(", ") ?? ""}
              onChange={(e) =>
                onConfigChange({
                  ...config,
                  cities: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>
        ) : null}
        {kind === "form_no_booking" ? (
          <div>
            <label className="text-xs text-muted-foreground">
              Days after form with no appointment
            </label>
            <Input
              type="number"
              className="mt-1"
              value={Number(config.formNoBookingDays ?? 7)}
              onChange={(e) =>
                onConfigChange({
                  ...config,
                  formNoBookingDays: Number(e.target.value) || 7,
                })
              }
            />
          </div>
        ) : null}
      </div>
    );
  }

  if (node.type === "WAIT") {
    const wait = parseWaitConfig(config);
    const mode = wait.mode;
    const setMode = (next: WaitMode) => onConfigChange({ ...config, mode: next });
    return (
      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium">Wait until</label>
          <select
            className="mt-1 flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={mode}
            onChange={(e) => setMode(e.target.value as WaitMode)}
          >
            <option value="delay">For a set period of time</option>
            <option value="date">Until a specific date/time</option>
            <option value="reply">Until the customer replies (SMS or email)</option>
            <option value="action">Until the customer takes action</option>
            {mode === "delay_or_reply" ? (
              <option value="delay_or_reply">Until delay or reply (legacy)</option>
            ) : null}
          </select>
        </div>
        {mode === "delay" || mode === "delay_or_reply" ? (
          <div>
            <label className="text-xs text-muted-foreground">
              Wait for (e.g. 2 days, 6 hours, 30 minutes)
            </label>
            <DurationFields
              amount={wait.delayAmount}
              unit={wait.delayUnit}
              onChange={(delayAmount, delayUnit) =>
                onConfigChange({ ...config, delayAmount, delayUnit })
              }
            />
          </div>
        ) : null}
        {mode === "date" ? (
          <div>
            <label className="text-xs text-muted-foreground">
              Continue at this date and time in {timezone} (company timezone)
            </label>
            <Input
              type="datetime-local"
              className="mt-1"
              value={campaignDatetimeLocalValue(config.sendAt, timezone)}
              onChange={(e) =>
                onConfigChange({
                  ...config,
                  sendAt: e.target.value || undefined,
                })
              }
            />
          </div>
        ) : null}
        {mode === "reply" || mode === "delay_or_reply" ? (
          <div>
            <label className="text-xs text-muted-foreground">
              Continue when the customer replies with
            </label>
            <Input
              className="mt-1"
              value={String(config.replyKeyword ?? "")}
              onChange={(e) => onConfigChange({ ...config, replyKeyword: e.target.value })}
              placeholder="yes, interested, sounds good"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Comma-separated words or phrases. Leave blank to continue on any SMS or email
              reply.{mode === "delay_or_reply" ? " Whichever happens first wins." : ""}
            </p>
          </div>
        ) : null}
        {mode === "action" ? (
          <div>
            <label className="text-xs text-muted-foreground">Customer action</label>
            <select
              className="mt-1 flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={wait.action}
              onChange={(e) =>
                onConfigChange({ ...config, action: e.target.value as WaitAction })
              }
            >
              <option value="opened">Opens an email</option>
              <option value="clicked">Clicks a link</option>
              <option value="opened_or_clicked">Opens an email or clicks a link</option>
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              Uses the most recent campaign email or SMS sent to this contact.
            </p>
          </div>
        ) : null}
      </div>
    );
  }

  if (node.type === "SEND_EMAIL") {
    return (
      <EmailCampaignEditor
        subject={String(config.subject ?? "")}
        bodyHtml={String(config.bodyHtml ?? "")}
        aiPrompt={String(config.aiPrompt ?? "")}
        defaultExpanded={false}
        onSubjectChange={(subject) => onConfigChange({ ...config, subject })}
        onAiPromptChange={(aiPrompt) => onConfigChange({ ...config, aiPrompt })}
        onBodyChange={(bodyHtml, bodyText) =>
          onConfigChange({ ...config, bodyHtml, bodyText })
        }
      />
    );
  }

  if (node.type === "SEND_SMS") {
    const bodyText = String(config.bodyText ?? "");
    return (
      <div>
        <div className="flex items-center justify-between gap-2">
          <label className="text-sm font-medium">SMS message</label>
          <InsertVariableButton
            onInsert={(token) => {
              const { next } = applyTokenToInput(smsRef.current, bodyText, token);
              onConfigChange({ ...config, bodyText: next });
            }}
          />
        </div>
        <textarea
          ref={smsRef}
          className="mt-1 min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          value={bodyText}
          onChange={(e) => onConfigChange({ ...config, bodyText: e.target.value })}
          placeholder="Reply STOP to opt out will be appended."
        />
      </div>
    );
  }

  if (node.type === "ADD_TAG") {
    return (
      <AddTagConfigEditor config={config} onConfigChange={onConfigChange} />
    );
  }

  if (node.type === "BRANCH") {
    return (
      <IfElseBranchEditor
        config={config}
        otherNodes={otherNodes}
        labelForNode={(id) => labelForId(id, allNodes)}
        onChange={(next) => onConfigChange(next)}
      />
    );
  }

  return <p className="text-sm text-muted-foreground">Customer exits the campaign here.</p>;
}
