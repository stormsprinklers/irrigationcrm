"use client";

import { useEffect, useState } from "react";
import {
  ChevronDown,
  GripVertical,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CampaignFlowNodeInput } from "@/lib/marketing/types";
import {
  IF_ELSE_FIELDS,
  IF_ELSE_MAX_BRANCHES,
  IF_ELSE_OPERATORS,
  emptyIfElseBranch,
  emptyIfElseSegment,
  ifElseWaitsForSmsReply,
  operatorNeedsValue,
  parseIfElseConfig,
  usesIfElseConfig,
  type IfElseBooleanOp,
  type IfElseBranch,
  type IfElseCondition,
  type IfElseConfig,
  type IfElseOperator,
  type IfElseSegment,
} from "@/lib/marketing/if-else";
import type { WaitDurationUnit } from "@/lib/marketing/wait-config";
import { cn } from "@/lib/utils";

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-white px-2 text-sm";

type Props = {
  config: Record<string, unknown>;
  otherNodes: CampaignFlowNodeInput[];
  labelForNode: (id: string) => string;
  onChange: (config: IfElseConfig) => void;
};

function operatorsForField(field: IfElseCondition["field"]) {
  if (field === "smsReply") {
    return IF_ELSE_OPERATORS.filter((operator) => operator.id !== "lt" && operator.id !== "gt");
  }
  return IF_ELSE_OPERATORS;
}

function valueInputType(condition: IfElseCondition): "text" | "number" | "date" {
  if (!operatorNeedsValue(condition.operator)) return "text";
  if (condition.field === "lastAppointmentAt" && ["is", "is_not", "lt", "gt"].includes(condition.operator)) {
    return "date";
  }
  if (condition.field === "ltv" && ["is", "is_not", "lt", "gt"].includes(condition.operator)) {
    return "number";
  }
  return "text";
}

function valuePlaceholder(condition: IfElseCondition) {
  if (condition.field === "smsReply") {
    if (condition.operator === "is_any_of" || condition.operator === "is_not_any_of") {
      return "yes, yeah, yep";
    }
    return "yes";
  }
  if (condition.operator === "is_any_of" || condition.operator === "is_not_any_of") {
    return condition.field === "tags" ? "vip, holiday" : "Salt Lake City, Lehi";
  }
  if (condition.field === "ltv") return "100";
  if (condition.field === "city") return "Salt Lake City";
  return "Value";
}

function NextStepSelect({
  value,
  emptyLabel,
  otherNodes,
  labelForNode,
  onChange,
}: {
  value: string;
  emptyLabel: string;
  otherNodes: CampaignFlowNodeInput[];
  labelForNode: (id: string) => string;
  onChange: (nextId: string) => void;
}) {
  return (
    <select className={selectClass} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{emptyLabel}</option>
      {otherNodes.map((node) => (
        <option key={node.id} value={node.id ?? ""}>
          {labelForNode(node.id ?? "")}
        </option>
      ))}
    </select>
  );
}

function BooleanOpToggle({
  value,
  onChange,
  ariaLabel,
}: {
  value: IfElseBooleanOp;
  onChange: (next: IfElseBooleanOp) => void;
  ariaLabel: string;
}) {
  return (
    <div
      className="inline-flex rounded-md border border-input bg-white p-0.5"
      role="group"
      aria-label={ariaLabel}
    >
      {(["AND", "OR"] as const).map((op) => (
        <button
          key={op}
          type="button"
          className={cn(
            "min-w-[3.25rem] rounded px-2 py-1 text-[11px] font-semibold tracking-wide",
            value === op
              ? "bg-slate-900 text-white"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
          aria-pressed={value === op}
          onClick={() => onChange(op)}
        >
          {op}
        </button>
      ))}
    </div>
  );
}

function ConditionRow({
  condition,
  onChange,
  onRemove,
  canRemove,
}: {
  condition: IfElseCondition;
  onChange: (next: IfElseCondition) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const inputType = valueInputType(condition);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className={cn(selectClass, "min-w-[9.5rem] flex-1")}
        value={condition.field}
        onChange={(e) => {
          const field = e.target.value as IfElseCondition["field"];
          const operators = operatorsForField(field);
          const operator = operators.some((item) => item.id === condition.operator)
            ? condition.operator
            : operators[0]?.id ?? "is";
          onChange({ ...condition, field, operator });
        }}
      >
        {IF_ELSE_FIELDS.map((field) => (
          <option key={field.id} value={field.id}>
            {field.label}
          </option>
        ))}
      </select>
      <select
        className={cn(selectClass, "min-w-[11rem] flex-1")}
        value={condition.operator}
        onChange={(e) =>
          onChange({ ...condition, operator: e.target.value as IfElseOperator })
        }
      >
        {operatorsForField(condition.field).map((operator) => (
          <option key={operator.id} value={operator.id}>
            {operator.label}
          </option>
        ))}
      </select>
      {operatorNeedsValue(condition.operator) ? (
        <Input
          type={inputType}
          className="h-9 min-w-[8rem] flex-1"
          value={condition.value}
          placeholder={valuePlaceholder(condition)}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
        />
      ) : null}
      {canRemove ? (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground"
          onClick={onRemove}
          aria-label="Remove condition"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

function SegmentEditor({
  segment,
  onChange,
  onRemove,
  canRemove,
}: {
  segment: IfElseSegment;
  onChange: (next: IfElseSegment) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  function updateCondition(index: number, next: IfElseCondition) {
    onChange({
      ...segment,
      conditions: segment.conditions.map((row, i) => (i === index ? next : row)),
    });
  }

  function removeCondition(index: number) {
    if (segment.conditions.length <= 1) {
      onRemove();
      return;
    }
    onChange({
      ...segment,
      conditions: segment.conditions.filter((_, i) => i !== index),
    });
  }

  return (
    <div className="rounded-md border bg-white p-3">
      <div className="space-y-2">
        {segment.conditions.map((condition, index) => (
          <div key={condition.id}>
            {index > 0 ? (
              <div className="mb-2 flex justify-center">
                <BooleanOpToggle
                  value={segment.booleanOp}
                  ariaLabel="Combine conditions in this segment"
                  onChange={(booleanOp) => onChange({ ...segment, booleanOp })}
                />
              </div>
            ) : null}
            <ConditionRow
              condition={condition}
              canRemove={segment.conditions.length > 1 || canRemove}
              onChange={(next) => updateCondition(index, next)}
              onRemove={() => removeCondition(index)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function BranchCard({
  branch,
  index,
  otherNodes,
  labelForNode,
  onChange,
  onRemove,
  onMove,
  canMoveUp,
  canMoveDown,
}: {
  branch: IfElseBranch;
  index: number;
  otherNodes: CampaignFlowNodeInput[];
  labelForNode: (id: string) => string;
  onChange: (next: IfElseBranch) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="rounded-lg border bg-slate-50/80">
      <div className="flex items-center gap-2 px-3 py-2">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
        <p className="flex-1 text-sm font-semibold">
          Branch <span className="ml-1 font-normal text-muted-foreground">{index + 1}</span>
        </p>
        <div className="relative">
          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:bg-white"
            onClick={() => setMenuOpen((value) => !value)}
            aria-label="Branch options"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen ? (
            <div className="absolute right-0 z-10 mt-1 w-36 rounded-md border bg-white py-1 text-sm shadow-md">
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left hover:bg-muted disabled:opacity-40"
                disabled={!canMoveUp}
                onClick={() => {
                  onMove(-1);
                  setMenuOpen(false);
                }}
              >
                Move up
              </button>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left hover:bg-muted disabled:opacity-40"
                disabled={!canMoveDown}
                onClick={() => {
                  onMove(1);
                  setMenuOpen(false);
                }}
              >
                Move down
              </button>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-red-600 hover:bg-muted"
                onClick={() => {
                  onRemove();
                  setMenuOpen(false);
                }}
              >
                Delete branch
              </button>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="rounded p-1 text-muted-foreground hover:bg-white"
          onClick={() => setOpen((value) => !value)}
          aria-label={open ? "Collapse branch" : "Expand branch"}
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", !open && "rotate-[-90deg]")} />
        </button>
      </div>
      {open ? (
        <div className="space-y-3 px-3 pb-3">
          {branch.segments.map((segment, segmentIndex) => (
            <div key={segment.id}>
              {segmentIndex > 0 ? (
                <div className="my-2 flex justify-center">
                  <BooleanOpToggle
                    value={segment.joinOp === "OR" ? "OR" : "AND"}
                    ariaLabel={`Combine segment ${segmentIndex} with the previous segment`}
                    onChange={(joinOp) =>
                      onChange({
                        ...branch,
                        segments: branch.segments.map((row, i) =>
                          i === segmentIndex ? { ...row, joinOp } : row
                        ),
                      })
                    }
                  />
                </div>
              ) : null}
              <SegmentEditor
                segment={segment}
                canRemove={branch.segments.length > 1}
                onChange={(next) =>
                  onChange({
                    ...branch,
                    segments: branch.segments.map((row, i) => (i === segmentIndex ? next : row)),
                  })
                }
                onRemove={() =>
                  onChange({
                    ...branch,
                    segments: branch.segments.filter((_, i) => i !== segmentIndex),
                  })
                }
              />
            </div>
          ))}
          <div className="flex justify-center pt-1">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-8 w-8"
              aria-label="Add segment"
              onClick={() =>
                onChange({
                  ...branch,
                  segments: [...branch.segments, emptyIfElseSegment("AND")],
                })
              }
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Then continue to
            </label>
            <NextStepSelect
              value={branch.nextId}
              emptyLabel="Exit campaign"
              otherNodes={otherNodes}
              labelForNode={labelForNode}
              onChange={(nextId) => onChange({ ...branch, nextId })}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function IfElseBranchEditor({ config, otherNodes, labelForNode, onChange }: Props) {
  const parsed = parseIfElseConfig(config);
  const [reorderHint, setReorderHint] = useState(false);

  useEffect(() => {
    if (!usesIfElseConfig(config)) {
      onChange(parseIfElseConfig(config));
    }
    // Convert legacy open/click branches once when the editor opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function commit(patch: Partial<IfElseConfig>) {
    onChange({ ...parsed, ...patch, kind: "if_else" });
  }

  function moveBranch(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= parsed.branches.length) return;
    const branches = [...parsed.branches];
    const [row] = branches.splice(index, 1);
    branches.splice(nextIndex, 0, row);
    commit({ branches });
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Branches
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Fork the contact journey based on conditions. Use SMS reply to split on what they text
          back (not case sensitive — Yes and yes match the same branch). First matching branch
          wins. SMS reply branches wait for a text; turn on a timeout if they never respond.
        </p>
      </div>

      <div className="rounded-lg border bg-white px-3 py-3">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={parsed.timeoutEnabled}
            onChange={(e) =>
              commit({
                timeoutEnabled: e.target.checked,
                timeoutAmount: parsed.timeoutAmount || 2,
                timeoutUnit: parsed.timeoutUnit || "days",
              })
            }
          />
          <span>
            <span className="font-medium">Wait with a timeout</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Adds a Timeout branch when the wait ends without a match — no reply yet, or the
              conditions still are not met. Timeout is always its own path, separate from None.
            </span>
          </span>
        </label>
        {parsed.timeoutEnabled ? (
          <div className="mt-3 grid grid-cols-[1fr_8rem] gap-2">
            <Input
              type="number"
              min={0}
              className="h-9"
              value={parsed.timeoutAmount}
              onChange={(e) => commit({ timeoutAmount: Number(e.target.value) || 0 })}
            />
            <select
              className={selectClass}
              value={parsed.timeoutUnit}
              onChange={(e) =>
                commit({ timeoutUnit: e.target.value as WaitDurationUnit })
              }
            >
              <option value="minutes">Minutes</option>
              <option value="hours">Hours</option>
              <option value="days">Days</option>
            </select>
          </div>
        ) : null}
      </div>

      <div className="space-y-3">
        {parsed.branches.map((branch, index) => (
          <BranchCard
            key={branch.id}
            branch={branch}
            index={index}
            otherNodes={otherNodes}
            labelForNode={labelForNode}
            canMoveUp={index > 0}
            canMoveDown={index < parsed.branches.length - 1}
            onChange={(next) =>
              commit({
                branches: parsed.branches.map((row, i) => (i === index ? next : row)),
              })
            }
            onRemove={() =>
              commit({ branches: parsed.branches.filter((_, i) => i !== index) })
            }
            onMove={(direction) => moveBranch(index, direction)}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="text-sm font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
          disabled={parsed.branches.length >= IF_ELSE_MAX_BRANCHES}
          onClick={() => commit({ branches: [...parsed.branches, emptyIfElseBranch()] })}
        >
          + Add branch
        </button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-xs"
          onClick={() => setReorderHint(true)}
        >
          Reorder branches
        </Button>
      </div>
      {reorderHint ? (
        <p className="text-xs text-muted-foreground">
          Use the ⋯ menu on a branch to move it up or down. First match wins, then None.
        </p>
      ) : null}
      {parsed.branches.length >= IF_ELSE_MAX_BRANCHES ? (
        <p className="text-xs text-muted-foreground">Maximum of {IF_ELSE_MAX_BRANCHES} branches.</p>
      ) : null}

      <div className="rounded-lg border bg-slate-50/80 px-3 py-3">
        <p className="text-sm font-semibold">None branch</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {ifElseWaitsForSmsReply(parsed)
            ? "Used when they reply, but none of the SMS / condition branches above match."
            : "Used when none of the conditions above are satisfied."}
        </p>
        <div className="mt-2">
          <NextStepSelect
            value={parsed.noneNextId}
            emptyLabel="Exit campaign"
            otherNodes={otherNodes}
            labelForNode={labelForNode}
            onChange={(noneNextId) => commit({ noneNextId })}
          />
        </div>
      </div>
      {parsed.timeoutEnabled ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-3">
          <p className="text-sm font-semibold">Timeout branch</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Always used when the wait ends without a matching reply or condition.
          </p>
          <div className="mt-2">
            <NextStepSelect
              value={parsed.timeoutNextId}
              emptyLabel="Exit campaign"
              otherNodes={otherNodes}
              labelForNode={labelForNode}
              onChange={(timeoutNextId) => commit({ timeoutNextId })}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
