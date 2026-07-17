"use client";

import { useState } from "react";
import {
  Clock,
  GitBranch,
  Mail,
  MessageSquare,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmailCampaignEditor } from "@/components/marketing/EmailCampaignEditor";
import type { CampaignFlowNodeInput, CampaignFlowNodeType } from "@/lib/marketing/types";
import { cn } from "@/lib/utils";

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
  { label: string; icon: typeof Mail; blurb: string }
> = {
  TRIGGER: {
    label: "Enrollment trigger",
    icon: Zap,
    blurb: "When someone enters this campaign",
  },
  WAIT: { label: "Wait", icon: Clock, blurb: "Delay or send on a date" },
  SEND_EMAIL: { label: "Send email", icon: Mail, blurb: "Email this customer" },
  SEND_SMS: { label: "Send SMS", icon: MessageSquare, blurb: "Text this customer" },
  BRANCH: {
    label: "Branch on reaction",
    icon: GitBranch,
    blurb: "Split on opened / clicked",
  },
  EXIT: { label: "Exit", icon: Trash2, blurb: "Leave the campaign" },
};

function newId() {
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
      return { mode: "delay", delayHours: 24, sendAt: undefined };
    case "SEND_EMAIL":
      return { subject: "", bodyHtml: "", bodyText: "", aiPrompt: "" };
    case "SEND_SMS":
      return { bodyText: "" };
    case "BRANCH":
      return {
        metric: "opened",
        waitHours: 48,
        yesNextId: "",
        noNextId: "",
      };
    case "EXIT":
      return {};
    default:
      return {};
  }
}

export function CampaignFlowEditor({
  nodes,
  onChange,
  emailsPerDay,
  smsPerDay,
  startAt,
  onSettingsChange,
}: Props) {
  const [expanded, setExpanded] = useState<number | null>(nodes.length ? 0 : null);
  const [addOpen, setAddOpen] = useState(false);

  function updateNode(index: number, patch: Partial<CampaignFlowNodeInput>) {
    onChange(
      nodes.map((n, i) =>
        i === index
          ? {
              ...n,
              ...patch,
              config: patch.config ? { ...n.config, ...patch.config } : n.config,
            }
          : n
      )
    );
  }

  function setConfig(index: number, config: Record<string, unknown>) {
    updateNode(index, { config });
  }

  function addNode(type: CampaignFlowNodeType) {
    const next: CampaignFlowNodeInput = {
      id: newId(),
      type,
      sortOrder: nodes.length,
      config: defaultConfig(type),
    };
    onChange([...nodes, next]);
    setExpanded(nodes.length);
    setAddOpen(false);
  }

  function removeNode(index: number) {
    const removed = nodes[index];
    const next = nodes
      .filter((_, i) => i !== index)
      .map((n, i) => ({
        ...n,
        sortOrder: i,
        config: {
          ...n.config,
          yesNextId: n.config.yesNextId === removed.id ? "" : n.config.yesNextId,
          noNextId: n.config.noNextId === removed.id ? "" : n.config.noNextId,
        },
      }));
    onChange(next);
    setExpanded(null);
  }

  const savedIds = nodes.filter((n) => n.id).map((n) => n.id!);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="text-sm font-medium">Emails per day</label>
          <Input
            type="number"
            className="mt-1"
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
          <label className="text-sm font-medium">SMS per day</label>
          <Input
            type="number"
            className="mt-1"
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
          <label className="text-sm font-medium">Start date</label>
          <Input
            type="date"
            className="mt-1"
            value={startAt?.slice(0, 10) ?? ""}
            onChange={(e) =>
              onSettingsChange({
                emailsPerDay,
                smsPerDay,
                startAt: e.target.value
                  ? new Date(e.target.value).toISOString()
                  : undefined,
              })
            }
          />
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Build an automation path: trigger → wait → send → branch on open/click. Steps run
        top-to-bottom unless a branch jumps to another step.
      </p>

      <div className="flex flex-col items-stretch gap-0">
        {nodes.map((node, index) => {
          const meta = NODE_META[node.type];
          const Icon = meta.icon;
          const isOpen = expanded === index;
          return (
            <div key={node.id ?? index} className="flex flex-col items-center">
              {index > 0 ? <div className="h-4 w-px bg-border" /> : null}
              <div className="w-full max-w-2xl rounded-lg border bg-white shadow-sm">
                <div className="flex items-center gap-3 p-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                    <Icon className="h-4 w-4" />
                  </div>
                  <button
                    type="button"
                    className="flex-1 text-left"
                    onClick={() => setExpanded(isOpen ? null : index)}
                  >
                    <p className="text-sm font-semibold">
                      {index + 1}. {meta.label}
                    </p>
                    <p className="text-xs text-muted-foreground">{meta.blurb}</p>
                  </button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => removeNode(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {isOpen ? (
                  <div className="border-t p-4">
                    <NodeConfigEditor
                      node={node}
                      otherNodes={nodes.filter((_, i) => i !== index)}
                      onConfigChange={(config) => setConfig(index, config)}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {addOpen ? (
        <div className="rounded-lg border bg-white p-2 shadow-sm">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-xs font-medium text-muted-foreground">Add step</span>
            <button type="button" onClick={() => setAddOpen(false)} className="text-xs">
              Close
            </button>
          </div>
          <div className="grid gap-1">
            {(Object.keys(NODE_META) as CampaignFlowNodeType[]).map((type) => {
              const meta = NODE_META[type];
              const Icon = meta.icon;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => addNode(type)}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
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
        <Button type="button" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Add step
        </Button>
      )}

      {/* Branch visualization when a BRANCH node exists */}
      {nodes.some((n) => n.type === "BRANCH") ? (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Decision branches</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {nodes
              .filter((n) => n.type === "BRANCH")
              .map((n) => (
                <div key={n.id} className="rounded-md border bg-muted/20 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide">
                    If {String(n.config.metric ?? "opened")}
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded bg-emerald-50 p-2 text-emerald-900">
                      Yes →{" "}
                      {labelForId(String(n.config.yesNextId ?? ""), nodes) || "pick step"}
                    </div>
                    <div className="rounded bg-slate-100 p-2 text-slate-700">
                      No →{" "}
                      {labelForId(String(n.config.noNextId ?? ""), nodes) || "pick step"}
                    </div>
                  </div>
                </div>
              ))}
          </div>
          {savedIds.length === 0 ? null : (
            <p className="mt-2 text-xs">Save the campaign so branch targets keep stable IDs.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function labelForId(id: string, nodes: CampaignFlowNodeInput[]) {
  const idx = nodes.findIndex((n) => n.id === id);
  if (idx < 0) return "";
  return `#${idx + 1} ${NODE_META[nodes[idx].type].label}`;
}

function NodeConfigEditor({
  node,
  otherNodes,
  onConfigChange,
}: {
  node: CampaignFlowNodeInput;
  otherNodes: CampaignFlowNodeInput[];
  onConfigChange: (config: Record<string, unknown>) => void;
}) {
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
            <option value="job_completed">Job / visit completed</option>
            <option value="form_no_booking">Form filled, no appointment</option>
            <option value="city">Customer city matches</option>
          </select>
        </div>
        {kind === "job_completed" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-muted-foreground">Min job value ($)</label>
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
              <label className="text-xs text-muted-foreground">Max job value ($)</label>
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
    const mode = String(config.mode ?? "delay");
    return (
      <div className="space-y-3">
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === "delay" ? "default" : "outline"}
            onClick={() => onConfigChange({ ...config, mode: "delay" })}
          >
            After a delay
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "date" ? "default" : "outline"}
            onClick={() => onConfigChange({ ...config, mode: "date" })}
          >
            On a date
          </Button>
        </div>
        {mode === "delay" ? (
          <div>
            <label className="text-xs text-muted-foreground">Wait hours</label>
            <Input
              type="number"
              className="mt-1"
              value={Number(config.delayHours ?? 24)}
              onChange={(e) =>
                onConfigChange({ ...config, delayHours: Number(e.target.value) || 0 })
              }
            />
          </div>
        ) : (
          <div>
            <label className="text-xs text-muted-foreground">Send at</label>
            <Input
              type="datetime-local"
              className="mt-1"
              value={
                config.sendAt
                  ? new Date(String(config.sendAt)).toISOString().slice(0, 16)
                  : ""
              }
              onChange={(e) =>
                onConfigChange({
                  ...config,
                  sendAt: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                })
              }
            />
          </div>
        )}
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
    return (
      <div>
        <label className="text-sm font-medium">SMS message</label>
        <textarea
          className="mt-1 min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          value={String(config.bodyText ?? "")}
          onChange={(e) => onConfigChange({ ...config, bodyText: e.target.value })}
          placeholder="Reply STOP to opt out will be appended."
        />
      </div>
    );
  }

  if (node.type === "BRANCH") {
    return (
      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium">Condition</label>
          <select
            className="mt-1 flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={String(config.metric ?? "opened")}
            onChange={(e) => onConfigChange({ ...config, metric: e.target.value })}
          >
            <option value="opened">Opened the previous email</option>
            <option value="clicked">Clicked a link</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">
            Wait this many hours before deciding
          </label>
          <Input
            type="number"
            className="mt-1"
            value={Number(config.waitHours ?? 48)}
            onChange={(e) =>
              onConfigChange({ ...config, waitHours: Number(e.target.value) || 0 })
            }
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-emerald-800">If yes →</label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={String(config.yesNextId ?? "")}
              onChange={(e) => onConfigChange({ ...config, yesNextId: e.target.value })}
            >
              <option value="">Next linear step</option>
              {otherNodes.map((n, i) => (
                <option key={n.id} value={n.id ?? ""}>
                  #{i + 1} {NODE_META[n.type].label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">If no →</label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={String(config.noNextId ?? "")}
              onChange={(e) => onConfigChange({ ...config, noNextId: e.target.value })}
            >
              <option value="">Exit campaign</option>
              {otherNodes.map((n, i) => (
                <option key={n.id} value={n.id ?? ""}>
                  #{i + 1} {NODE_META[n.type].label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className={cn("text-xs text-muted-foreground")}>
          Save the draft after adding steps so branch targets appear with stable IDs.
        </p>
      </div>
    );
  }

  return <p className="text-sm text-muted-foreground">Customer exits the campaign here.</p>;
}
