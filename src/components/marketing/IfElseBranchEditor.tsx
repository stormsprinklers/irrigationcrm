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
  emptyIfElseCondition,
  emptyIfElseSegment,
  operatorNeedsValue,
  parseIfElseConfig,
  usesIfElseConfig,
  type IfElseBranch,
  type IfElseCondition,
  type IfElseConfig,
  type IfElseOperator,
  type IfElseSegment,
} from "@/lib/marketing/if-else";
import { cn } from "@/lib/utils";

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-white px-2 text-sm";

type Props = {
  config: Record<string, unknown>;
  otherNodes: CampaignFlowNodeInput[];
  labelForNode: (id: string) => string;
  onChange: (config: IfElseConfig) => void;
};

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
        onChange={(e) =>
          onChange({ ...condition, field: e.target.value as IfElseCondition["field"] })
        }
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
        {IF_ELSE_OPERATORS.map((operator) => (
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

  return (
    <div className="rounded-md border bg-white p-3">
      <div className="space-y-2">
        {segment.conditions.map((condition, index) => (
          <ConditionRow
            key={condition.id}
            condition={condition}
            canRemove={segment.conditions.length > 1}
            onChange={(next) => updateCondition(index, next)}
            onRemove={() =>
              onChange({
                ...segment,
                conditions: segment.conditions.filter((_, i) => i !== index),
              })
            }
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <select
            className="flex h-8 rounded-md border border-input bg-white px-2 text-xs font-medium"
            value={segment.booleanOp}
            onChange={(e) =>
              onChange({ ...segment, booleanOp: e.target.value === "OR" ? "OR" : "AND" })
            }
          >
            <option value="AND">AND</option>
            <option value="OR">OR</option>
          </select>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-8 w-8"
            onClick={() =>
              onChange({
                ...segment,
                conditions: [...segment.conditions, emptyIfElseCondition()],
              })
            }
            aria-label="Add condition"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        {canRemove ? (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={onRemove}
          >
            Remove segment
          </button>
        ) : null}
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
                <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  AND
                </p>
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
          <button
            type="button"
            className="text-sm font-medium text-primary hover:underline"
            onClick={() =>
              onChange({ ...branch, segments: [...branch.segments, emptyIfElseSegment()] })
            }
          >
            + Add segment
          </button>
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
          Fork the contact journey based on conditions. The first matching branch wins.
        </p>
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
          Used when none of the conditions above are satisfied.
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
    </div>
  );
}
