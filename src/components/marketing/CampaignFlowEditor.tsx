"use client";

import { useEffect, useRef, useState } from "react";
import {
  Clock,
  GitBranch,
  Mail,
  MessageSquare,
  Plus,
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
import type { CampaignFlowNodeInput, CampaignFlowNodeType } from "@/lib/marketing/types";
import {
  branchPreview,
  defaultIfElseConfig,
  ifElseSummary,
  parseIfElseConfig,
  scrubIfElseNextIds,
} from "@/lib/marketing/if-else";
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
  { label: string; icon: typeof Mail; blurb: string }
> = {
  TRIGGER: {
    label: "Enrollment trigger",
    icon: Zap,
    blurb: "When someone enters this campaign",
  },
  WAIT: { label: "Wait", icon: Clock, blurb: "Time, date, reply, or email action" },
  SEND_EMAIL: { label: "Send email", icon: Mail, blurb: "Email this customer" },
  SEND_SMS: { label: "Send SMS", icon: MessageSquare, blurb: "Text this customer" },
  ADD_TAG: {
    label: "Add tag",
    icon: Tag,
    blurb: "Apply a tag to this customer",
  },
  BRANCH: {
    label: "If/Else",
    icon: GitBranch,
    blurb: "Fork the contact journey through this workflow based on conditions",
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

  function setConfig(index: number, config: Record<string, unknown>) {
    onChange(nodes.map((n, i) => (i === index ? { ...n, config } : n)));
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
        config: scrubIfElseNextIds(n.config, removed.id ?? ""),
      }));
    onChange(next);
    setExpanded(null);
  }

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
            value={campaignStartDateInputValue(startAt, timezone)}
            onChange={(e) =>
              onSettingsChange({
                emailsPerDay,
                smsPerDay,
                startAt: e.target.value || undefined,
              })
            }
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {timezone} calendar date. Enrollment starts at 5:00 AM that morning
            (sends stay inside 5:00 AM–9:00 PM).
          </p>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Build an automation path: trigger → wait → send → if/else. Wait can be a set
        period of time, a specific date and time, a customer reply, or an email open/click.
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
                    <p className="text-xs text-muted-foreground">
                      {node.type === "WAIT"
                        ? waitSummary(node.config, timezone)
                        : node.type === "BRANCH"
                          ? ifElseSummary(node.config)
                          : node.type === "ADD_TAG"
                            ? addTagSummary(node.config)
                            : meta.blurb}
                    </p>
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
                      allNodes={nodes}
                      otherNodes={nodes.filter((_, i) => i !== index)}
                      timezone={timezone}
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

      {nodes.some((n) => n.type === "BRANCH") ? (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">If/Else branches</p>
          <div className="mt-3 space-y-3">
            {nodes
              .filter((n) => n.type === "BRANCH")
              .map((n) => {
                const parsed = parseIfElseConfig(n.config);
                return (
                  <div key={n.id} className="rounded-md border bg-muted/20 p-3">
                    <div className="space-y-2 text-xs">
                      {parsed.branches.map((branch, index) => (
                        <div key={branch.id} className="rounded bg-emerald-50 p-2 text-emerald-900">
                          Branch {index + 1}: {branchPreview(branch)} →{" "}
                          {labelForId(branch.nextId, nodes) || "exit"}
                        </div>
                      ))}
                      <div className="rounded bg-slate-100 p-2 text-slate-700">
                        None → {labelForId(parsed.noneNextId, nodes) || "exit"}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
          <p className="mt-2 text-xs">
            The first matching branch wins. If none match, the contact follows None.
          </p>
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
