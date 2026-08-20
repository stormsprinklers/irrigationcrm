"use client";

import { useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { CheckCircle2, FlaskConical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TechAssistOptionMatch } from "@/lib/storm-ai/tech-assist";
import { cn } from "@/lib/utils";

export type EditorNodeType = "DIAGNOSTIC" | "RESOLUTION";

export type EditorMatchCondition = {
  id: string;
  match: TechAssistOptionMatch;
  /** Free-text phrase for label matching (used by OR alternatives). */
  label: string;
  value: string;
  min: string;
  max: string;
};

export type EditorOption = {
  id: string;
  label: string;
  match: TechAssistOptionMatch;
  value: string;
  min: string;
  max: string;
  anyOf: EditorMatchCondition[];
  nextNodeId: string;
};

export type EditorNode = {
  id: string;
  type: EditorNodeType;
  title: string;
  /** Test / question for diagnostics; resolution instructions for resolutions */
  body: string;
  tips: string;
  options: EditorOption[];
  sortOrder: number;
};

export function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyDiagnostic(sortOrder = 0): EditorNode {
  return {
    id: newId(),
    type: "DIAGNOSTIC",
    title: "Diagnostic",
    body: "",
    tips: "",
    options: [],
    sortOrder,
  };
}

export function emptyResolution(sortOrder = 0): EditorNode {
  return {
    id: newId(),
    type: "RESOLUTION",
    title: "Resolution",
    body: "",
    tips: "",
    options: [],
    sortOrder,
  };
}

function emptyCondition(partial?: Partial<EditorMatchCondition>): EditorMatchCondition {
  return {
    id: newId(),
    match: "label",
    label: "",
    value: "",
    min: "",
    max: "",
    ...partial,
  };
}

function emptyOption(partial?: Partial<EditorOption>): EditorOption {
  return {
    id: newId(),
    label: "",
    match: "label",
    value: "",
    min: "",
    max: "",
    anyOf: [],
    nextNodeId: "",
    ...partial,
  };
}

function parseStoredAnyOf(raw: unknown): EditorMatchCondition[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const alt = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    return emptyCondition({
      id: String(alt.id ?? newId()),
      match: (alt.match as TechAssistOptionMatch) || "label",
      label: String(alt.label ?? ""),
      value: alt.value != null ? String(alt.value) : "",
      min: alt.min != null ? String(alt.min) : "",
      max: alt.max != null ? String(alt.max) : "",
    });
  });
}

function serializeMatchValue(value: string) {
  if (value === "") return undefined;
  return Number.isNaN(Number(value)) ? value : Number(value);
}

function serializeMatchNumber(value: string) {
  if (value === "") return undefined;
  const num = Number(value);
  return Number.isNaN(num) ? undefined : num;
}

/** Migrate legacy BRANCH nodes into the preceding DIAGNOSTIC's options. */
export function migrateLegacyNodes(
  raw: Array<{
    id: string;
    type: string;
    title: string;
    body: string;
    sortOrder: number;
    config?: Record<string, unknown>;
  }>
): EditorNode[] {
  const sorted = [...raw].sort((a, b) => a.sortOrder - b.sortOrder);
  const result: EditorNode[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const node = sorted[i]!;
    if (node.type === "BRANCH") continue;

    const config = node.config && typeof node.config === "object" ? node.config : {};
    let options: EditorOption[] = [];

    if (Array.isArray(config.options) && config.options.length > 0) {
      options = config.options.map((opt: Record<string, unknown>) => ({
        id: String(opt.id ?? newId()),
        label: String(opt.label ?? ""),
        match: (opt.match as TechAssistOptionMatch) || "label",
        value: opt.value != null ? String(opt.value) : "",
        min: opt.min != null ? String(opt.min) : "",
        max: opt.max != null ? String(opt.max) : "",
        anyOf: parseStoredAnyOf(opt.anyOf),
        nextNodeId: String(opt.nextNodeId ?? ""),
      }));
    } else {
      const next = sorted[i + 1];
      if (next?.type === "BRANCH") {
        const branchConfig =
          next.config && typeof next.config === "object" ? next.config : {};
        const rules = Array.isArray(branchConfig.rules) ? branchConfig.rules : [];
        options = rules.map((rule: Record<string, unknown>) => {
          const op = String(rule.op ?? "eq");
          const match = (["lt", "gt", "lte", "gte", "between", "eq"].includes(op)
            ? op
            : "label") as TechAssistOptionMatch;
          let label = "";
          if (op === "between") label = `${rule.min ?? ""}–${rule.max ?? ""}`;
          else if (op === "lt") label = `< ${rule.value ?? ""}`;
          else if (op === "gt") label = `> ${rule.value ?? ""}`;
          else if (op === "lte") label = `≤ ${rule.value ?? ""}`;
          else if (op === "gte") label = `≥ ${rule.value ?? ""}`;
          else if (op === "in" && Array.isArray(rule.values)) {
            label = rule.values.map(String).join(" / ");
          } else label = String(rule.value ?? "Option");
          return emptyOption({
            label,
            match: op === "in" ? "label" : match,
            value: rule.value != null ? String(rule.value) : "",
            min: rule.min != null ? String(rule.min) : "",
            max: rule.max != null ? String(rule.max) : "",
            nextNodeId: String(rule.nextNodeId ?? ""),
          });
        });
      } else if (node.type === "DIAGNOSTIC" && config.inputType === "yes_no") {
        options = [
          emptyOption({ label: "Yes", match: "yes" }),
          emptyOption({ label: "No", match: "no" }),
        ];
      } else if (
        node.type === "DIAGNOSTIC" &&
        Array.isArray(config.choices) &&
        config.choices.length
      ) {
        options = config.choices.map((c: unknown) =>
          emptyOption({ label: String(c), match: "label" })
        );
      }
    }

    result.push({
      id: node.id,
      type: node.type === "RESOLUTION" ? "RESOLUTION" : "DIAGNOSTIC",
      title: node.title,
      body: node.body ?? "",
      tips: String(config.tips ?? ""),
      options,
      sortOrder: node.sortOrder ?? result.length,
    });
  }

  return result;
}

export function nodesToSavePayload(nodes: EditorNode[], entryNodeId: string | null) {
  return {
    entryNodeId: entryNodeId || nodes[0]?.id || null,
    nodes: nodes.map((node, index) => ({
      id: node.id,
      type: node.type,
      title: node.title,
      body: node.body,
      sortOrder: index,
      config:
        node.type === "DIAGNOSTIC"
          ? {
              tips: node.tips.trim() || undefined,
              options: node.options.map((option) => ({
                id: option.id,
                label: option.label.trim() || "Option",
                match: option.match,
                value: serializeMatchValue(option.value),
                min: serializeMatchNumber(option.min),
                max: serializeMatchNumber(option.max),
                anyOf:
                  option.anyOf.length > 0
                    ? option.anyOf.map((alt) => ({
                        id: alt.id,
                        match: alt.match,
                        label: alt.label.trim() || undefined,
                        value: serializeMatchValue(alt.value),
                        min: serializeMatchNumber(alt.min),
                        max: serializeMatchNumber(alt.max),
                      }))
                    : undefined,
                nextNodeId: option.nextNodeId || null,
              })),
            }
          : {},
    })),
  };
}

function VerticalConnector({ taller }: { taller?: boolean }) {
  return <div className={`w-px bg-border ${taller ? "h-5" : "h-3"}`} />;
}

function InsertDiagnosticButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex flex-col items-center py-1">
      <VerticalConnector />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 gap-1 rounded-full px-2 text-xs"
        onClick={onClick}
      >
        <Plus className="h-3 w-3" />
        Diagnostic
      </Button>
      <VerticalConnector />
    </div>
  );
}

function NextStepActions({
  onDiagnostic,
  onResolution,
}: {
  onDiagnostic: () => void;
  onResolution: () => void;
}) {
  return (
    <div className="mt-2 flex flex-col items-center gap-2">
      <VerticalConnector />
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={onDiagnostic}>
          + Diagnostic
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onResolution}>
          + Resolution
        </Button>
      </div>
    </div>
  );
}

function PanCanvas({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [grabbing, setGrabbing] = useState(false);

  function shouldIgnore(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest("button, input, textarea, select, a, label"));
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || shouldIgnore(e.target)) return;
    const el = ref.current;
    if (!el) return;
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      left: el.scrollLeft,
      top: el.scrollTop,
    };
    setGrabbing(true);
    el.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    const start = drag.current;
    if (!el || !start) return;
    el.scrollLeft = start.left - (e.clientX - start.x);
    el.scrollTop = start.top - (e.clientY - start.y);
  }

  function endDrag(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    drag.current = null;
    setGrabbing(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }

  return (
    <div
      ref={ref}
      className={cn(
        "h-full min-h-[28rem] overflow-auto rounded-lg border border-border bg-muted/20",
        grabbing ? "cursor-grabbing select-none" : "cursor-grab"
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="inline-block min-h-full min-w-full p-8" style={{ width: "max-content" }}>
        {children}
      </div>
    </div>
  );
}

function YSplit({ count }: { count: number }) {
  if (count <= 0) return null;
  if (count === 1) {
    return (
      <div className="flex flex-col items-center">
        <VerticalConnector taller />
      </div>
    );
  }
  return (
    <div className="flex w-full flex-col items-center">
      <div className="h-3 w-px bg-border" />
      <div className="flex w-full">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="relative flex h-7 flex-1 justify-center">
            <div
              className={cn(
                "absolute top-0 h-px bg-border",
                i === 0
                  ? "left-1/2 right-0"
                  : i === count - 1
                    ? "left-0 right-1/2"
                    : "inset-x-0"
              )}
            />
            <div className="absolute top-0 h-7 w-px bg-border" />
          </div>
        ))}
      </div>
    </div>
  );
}

function matchNeedsValue(match: TechAssistOptionMatch) {
  return match === "eq" || match === "lt" || match === "gt" || match === "lte" || match === "gte";
}

function matchNeedsRange(match: TechAssistOptionMatch) {
  return match === "between";
}

function MatchTypeSelect({
  value,
  onChange,
}: {
  value: TechAssistOptionMatch;
  onChange: (value: TechAssistOptionMatch) => void;
}) {
  return (
    <select
      className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value as TechAssistOptionMatch)}
    >
      <option value="label">Match label / free text</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
      <option value="lt">Number &lt;</option>
      <option value="gt">Number &gt;</option>
      <option value="lte">Number ≤</option>
      <option value="gte">Number ≥</option>
      <option value="eq">Number equals</option>
      <option value="between">Number between</option>
    </select>
  );
}

function optionBranchLabel(option: EditorOption) {
  const primary = option.label.trim() || "Option";
  if (!option.anyOf.length) return primary;
  const alts = option.anyOf
    .map((alt) => {
      if (alt.match === "yes") return "Yes";
      if (alt.match === "no") return "No";
      if (alt.match === "between" && (alt.min || alt.max)) return `${alt.min}–${alt.max}`;
      if (matchNeedsValue(alt.match) && alt.value) {
        const op =
          alt.match === "lt"
            ? "<"
            : alt.match === "gt"
              ? ">"
              : alt.match === "lte"
                ? "≤"
                : alt.match === "gte"
                  ? "≥"
                  : "=";
        return `${op} ${alt.value}`;
      }
      return alt.label.trim();
    })
    .filter(Boolean);
  return alts.length ? `${primary} OR ${alts.join(" OR ")}` : primary;
}

type Props = {
  nodes: EditorNode[];
  entryNodeId: string;
  onChange: (nodes: EditorNode[]) => void;
  onEntryChange: (id: string) => void;
};

export function TechAssistFlowEditor({ nodes, entryNodeId, onChange, onEntryChange }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(entryNodeId || nodes[0]?.id || null);
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const reachable = useMemo(() => {
    const seen = new Set<string>();
    const walk = (id: string | null | undefined) => {
      if (!id || seen.has(id)) return;
      const node = byId.get(id);
      if (!node) return;
      seen.add(id);
      for (const option of node.options) walk(option.nextNodeId);
    };
    walk(entryNodeId || nodes[0]?.id);
    return seen;
  }, [byId, entryNodeId, nodes]);

  const orphans = nodes.filter((n) => !reachable.has(n.id));

  function updateNode(id: string, patch: Partial<EditorNode>) {
    onChange(nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }

  function removeNode(id: string) {
    const next = nodes
      .filter((n) => n.id !== id)
      .map((n) => ({
        ...n,
        options: n.options.map((o) =>
          o.nextNodeId === id ? { ...o, nextNodeId: "" } : o
        ),
      }));
    onChange(next);
    if (entryNodeId === id) onEntryChange(next[0]?.id ?? "");
  }

  function addChild(
    parentId: string,
    optionId: string,
    type: EditorNodeType
  ) {
    const child = type === "RESOLUTION" ? emptyResolution(nodes.length) : emptyDiagnostic(nodes.length);
    onChange(
      nodes
        .map((n) =>
          n.id === parentId
            ? {
                ...n,
                options: n.options.map((o) =>
                  o.id === optionId ? { ...o, nextNodeId: child.id } : o
                ),
              }
            : n
        )
        .concat(child)
    );
    setExpandedId(child.id);
    setEditingOptionId(null);
  }

  /** Insert a diagnostic between this option and its current next step. */
  function insertDiagnosticBetween(parentId: string, optionId: string) {
    const parent = nodes.find((n) => n.id === parentId);
    const option = parent?.options.find((o) => o.id === optionId);
    if (!parent || !option) return;
    const previousNext = option.nextNodeId;
    const child = emptyDiagnostic(nodes.length);
    child.options = [
      emptyOption({
        label: "Continue",
        match: "label",
        nextNodeId: previousNext || "",
      }),
    ];
    onChange(
      nodes
        .map((n) =>
          n.id === parentId
            ? {
                ...n,
                options: n.options.map((o) =>
                  o.id === optionId ? { ...o, nextNodeId: child.id } : o
                ),
              }
            : n
        )
        .concat(child)
    );
    setExpandedId(child.id);
    setEditingOptionId(null);
  }

  function addOptionBranch(nodeId: string) {
    const node = byId.get(nodeId);
    if (!node) return;
    const option = emptyOption({ match: "label" });
    updateNode(nodeId, { options: [...node.options, option] });
    setEditingOptionId(option.id);
    setExpandedId(null);
  }

  function renderNode(
    nodeId: string,
    depth: number,
    pathSeen: Set<string> = new Set()
  ): ReactNode {
    const node = byId.get(nodeId);
    if (!node) return null;
    if (pathSeen.has(nodeId)) {
      return (
        <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          Loops back to “{node.title || "step"}”
        </div>
      );
    }
    const nextSeen = new Set(pathSeen);
    nextSeen.add(nodeId);
    const isDiagnostic = node.type === "DIAGNOSTIC";
    const expanded = expandedId === node.id;
    const optionCount = node.options.length;

    return (
      <div key={node.id} className="flex w-max flex-col items-center">
        <div
          className={`w-80 shrink-0 rounded-lg border bg-white shadow-sm ${
            isDiagnostic ? "border-sky-200" : "border-emerald-200"
          }`}
        >
          <button
            type="button"
            className="flex w-full items-start gap-3 p-4 text-left"
            onClick={() => {
              setExpandedId(expanded ? null : node.id);
              setEditingOptionId(null);
            }}
          >
            <span
              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                isDiagnostic ? "bg-sky-100 text-sky-700" : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {isDiagnostic ? (
                <FlaskConical className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {isDiagnostic ? "Diagnostic" : "Resolution"}
              </span>
              <span className="block font-semibold text-foreground">
                {node.title || (isDiagnostic ? "Untitled test" : "Untitled resolution")}
              </span>
              {!expanded ? (
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {node.body || (isDiagnostic ? "No test yet" : "No instructions yet")}
                  {isDiagnostic && optionCount > 0 ? ` · ${optionCount} option${optionCount === 1 ? "" : "s"}` : ""}
                </span>
              ) : null}
            </span>
          </button>

          {expanded ? (
            <div className="space-y-3 border-t border-border px-4 pb-4 pt-3">
              <label className="block text-sm">
                Title
                <Input
                  className="mt-1"
                  value={node.title}
                  onChange={(e) => updateNode(node.id, { title: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                {isDiagnostic ? "Test (what to do or ask)" : "Resolution instructions"}
                <textarea
                  className="mt-1 min-h-[80px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={node.body}
                  onChange={(e) => updateNode(node.id, { body: e.target.value })}
                  placeholder={
                    isDiagnostic
                      ? "e.g. Measure ohms across the solenoid leads"
                      : "e.g. Replace the solenoid and retest the zone"
                  }
                />
              </label>
              {isDiagnostic ? (
                <label className="block text-sm">
                  Tips (optional guidance if unclear)
                  <textarea
                    className="mt-1 min-h-[60px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={node.tips}
                    onChange={(e) => updateNode(node.id, { tips: e.target.value })}
                    placeholder="e.g. Probe both wires with the meter on resistance mode"
                  />
                </label>
              ) : null}

              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => removeNode(node.id)}
                >
                  Delete step
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        {isDiagnostic ? (
          <div className="flex w-max flex-col items-center">
            <YSplit count={optionCount + 1} />
            <div className="flex items-start justify-center gap-12">
              {node.options.map((option, oi) => {
                const editing = editingOptionId === option.id;
                return (
                  <div
                    key={option.id}
                    className="flex w-max min-w-80 flex-col items-center"
                  >
                    <button
                      type="button"
                      className={cn(
                        "mb-1 max-w-[14rem] rounded-full border px-3 py-1.5 text-center text-xs font-medium transition-colors",
                        editing
                          ? "border-sky-400 bg-sky-50 text-sky-900"
                          : "border-border bg-muted/50 hover:border-sky-300 hover:bg-sky-50/60"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingOptionId(editing ? null : option.id);
                        setExpandedId(null);
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      {optionBranchLabel(option)}
                    </button>
                    {editing ? (
                      <div
                        className="mt-2 w-[min(100%,20rem)] space-y-2 rounded-lg border border-sky-200 bg-white p-3 text-left shadow-sm"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-start gap-2">
                          <Input
                            className="flex-1"
                            placeholder="Option label (shown to AI)"
                            value={option.label}
                            onChange={(e) => {
                              const options = [...node.options];
                              options[oi] = { ...option, label: e.target.value };
                              updateNode(node.id, { options });
                            }}
                          />
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label="Delete option"
                            onClick={() => {
                              updateNode(node.id, {
                                options: node.options.filter((o) => o.id !== option.id),
                              });
                              setEditingOptionId(null);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="text-xs">
                            Match type
                            <MatchTypeSelect
                              value={option.match}
                              onChange={(match) => {
                                const options = [...node.options];
                                options[oi] = { ...option, match };
                                updateNode(node.id, { options });
                              }}
                            />
                          </label>
                          {matchNeedsValue(option.match) ? (
                            <label className="text-xs">
                              Value
                              <Input
                                className="mt-1"
                                value={option.value}
                                onChange={(e) => {
                                  const options = [...node.options];
                                  options[oi] = { ...option, value: e.target.value };
                                  updateNode(node.id, { options });
                                }}
                              />
                            </label>
                          ) : null}
                          {matchNeedsRange(option.match) ? (
                            <>
                              <label className="text-xs">
                                Min
                                <Input
                                  className="mt-1"
                                  value={option.min}
                                  onChange={(e) => {
                                    const options = [...node.options];
                                    options[oi] = { ...option, min: e.target.value };
                                    updateNode(node.id, { options });
                                  }}
                                />
                              </label>
                              <label className="text-xs">
                                Max
                                <Input
                                  className="mt-1"
                                  value={option.max}
                                  onChange={(e) => {
                                    const options = [...node.options];
                                    options[oi] = { ...option, max: e.target.value };
                                    updateNode(node.id, { options });
                                  }}
                                />
                              </label>
                            </>
                          ) : null}
                        </div>
                        <div className="space-y-2 rounded-md border border-dashed border-border bg-muted/20 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-medium text-muted-foreground">
                              Also match if (OR)
                            </p>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const options = [...node.options];
                                options[oi] = {
                                  ...option,
                                  anyOf: [...option.anyOf, emptyCondition()],
                                };
                                updateNode(node.id, { options });
                              }}
                            >
                              <Plus className="mr-1 h-3 w-3" />
                              OR
                            </Button>
                          </div>
                          {option.anyOf.length === 0 ? (
                            <p className="text-[11px] text-muted-foreground">
                              Optional. Add another condition so this branch is taken if either
                              match is true.
                            </p>
                          ) : null}
                          {option.anyOf.map((alt, ai) => (
                            <div
                              key={alt.id}
                              className="space-y-2 rounded-md border border-border bg-background p-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                  OR condition {ai + 1}
                                </span>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => {
                                    const options = [...node.options];
                                    options[oi] = {
                                      ...option,
                                      anyOf: option.anyOf.filter((row) => row.id !== alt.id),
                                    };
                                    updateNode(node.id, { options });
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                              <div className="grid gap-2 sm:grid-cols-2">
                                <label className="text-xs">
                                  Match type
                                  <MatchTypeSelect
                                    value={alt.match}
                                    onChange={(match) => {
                                      const options = [...node.options];
                                      const anyOf = [...option.anyOf];
                                      anyOf[ai] = { ...alt, match };
                                      options[oi] = { ...option, anyOf };
                                      updateNode(node.id, { options });
                                    }}
                                  />
                                </label>
                                {alt.match === "label" ? (
                                  <label className="text-xs">
                                    Phrase to match
                                    <Input
                                      className="mt-1"
                                      value={alt.label}
                                      placeholder="e.g. open circuit"
                                      onChange={(e) => {
                                        const options = [...node.options];
                                        const anyOf = [...option.anyOf];
                                        anyOf[ai] = { ...alt, label: e.target.value };
                                        options[oi] = { ...option, anyOf };
                                        updateNode(node.id, { options });
                                      }}
                                    />
                                  </label>
                                ) : null}
                                {matchNeedsValue(alt.match) ? (
                                  <label className="text-xs">
                                    Value
                                    <Input
                                      className="mt-1"
                                      value={alt.value}
                                      onChange={(e) => {
                                        const options = [...node.options];
                                        const anyOf = [...option.anyOf];
                                        anyOf[ai] = { ...alt, value: e.target.value };
                                        options[oi] = { ...option, anyOf };
                                        updateNode(node.id, { options });
                                      }}
                                    />
                                  </label>
                                ) : null}
                                {matchNeedsRange(alt.match) ? (
                                  <>
                                    <label className="text-xs">
                                      Min
                                      <Input
                                        className="mt-1"
                                        value={alt.min}
                                        onChange={(e) => {
                                          const options = [...node.options];
                                          const anyOf = [...option.anyOf];
                                          anyOf[ai] = { ...alt, min: e.target.value };
                                          options[oi] = { ...option, anyOf };
                                          updateNode(node.id, { options });
                                        }}
                                      />
                                    </label>
                                    <label className="text-xs">
                                      Max
                                      <Input
                                        className="mt-1"
                                        value={alt.max}
                                        onChange={(e) => {
                                          const options = [...node.options];
                                          const anyOf = [...option.anyOf];
                                          anyOf[ai] = { ...alt, max: e.target.value };
                                          options[oi] = { ...option, anyOf };
                                          updateNode(node.id, { options });
                                        }}
                                      />
                                    </label>
                                  </>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                        <label className="block text-xs">
                          Goes to
                          <select
                            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                            value={option.nextNodeId}
                            onChange={(e) => {
                              const options = [...node.options];
                              options[oi] = { ...option, nextNodeId: e.target.value };
                              updateNode(node.id, { options });
                            }}
                          >
                            <option value="">Select step…</option>
                            {nodes
                              .filter((n) => n.id !== node.id)
                              .map((n) => (
                                <option key={n.id} value={n.id}>
                                  {n.type === "RESOLUTION" ? "Resolution: " : "Diagnostic: "}
                                  {n.title || n.id.slice(0, 6)}
                                </option>
                              ))}
                          </select>
                        </label>
                      </div>
                    ) : null}
                    {option.nextNodeId && byId.has(option.nextNodeId) ? (
                      <>
                        <InsertDiagnosticButton
                          onClick={() => insertDiagnosticBetween(node.id, option.id)}
                        />
                        {depth < 12 ? renderNode(option.nextNodeId, depth + 1, nextSeen) : null}
                      </>
                    ) : (
                      <NextStepActions
                        onDiagnostic={() => addChild(node.id, option.id, "DIAGNOSTIC")}
                        onResolution={() => addChild(node.id, option.id, "RESOLUTION")}
                      />
                    )}
                  </div>
                );
              })}
              <div className="flex w-max min-w-80 flex-col items-center">
                <button
                  type="button"
                  className="mb-1 max-w-[14rem] rounded-full border border-dashed border-sky-300 bg-sky-50/50 px-3 py-1.5 text-center text-xs font-medium text-sky-800 hover:bg-sky-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    addOptionBranch(node.id);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  + Add Option
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  const startId = entryNodeId || nodes[0]?.id;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <p className="shrink-0 text-xs text-muted-foreground">
        Click a diagnostic to edit the test. Click an option chip to edit that branch, or use + Add
        Option. Drag empty space to pan.
      </p>
      <div className="min-h-0 flex-1">
        <PanCanvas>
          <div className="flex flex-col items-center">
            <div className="w-full max-w-sm rounded-lg border border-border bg-muted/40 p-4 text-center">
              <p className="text-sm font-semibold">Issue start</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Storm AI begins at the first diagnostic below.
              </p>
              {nodes.length > 1 ? (
                <label className="mt-3 block text-left text-xs">
                  Starting step
                  <select
                    className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                    value={startId ?? ""}
                    onChange={(e) => onEntryChange(e.target.value)}
                  >
                    {nodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.title || n.id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>

            {startId ? (
              <>
                <VerticalConnector taller />
                {renderNode(startId, 0)}
              </>
            ) : (
              <div className="mt-4 flex flex-col items-center gap-2">
                <VerticalConnector />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const node = emptyDiagnostic(0);
                      onChange([node]);
                      onEntryChange(node.id);
                      setExpandedId(node.id);
                    }}
                  >
                    Add first diagnostic
                  </Button>
                </div>
              </div>
            )}

            {orphans.length > 0 ? (
              <div className="mt-8 w-full max-w-5xl rounded-lg border border-dashed border-border p-4">
                <p className="mb-3 text-sm font-medium">Unused steps</p>
                <p className="mb-3 text-xs text-muted-foreground">
                  Not reachable from the start. Connect them from an option, or delete them.
                </p>
                <div className="flex flex-col items-center gap-4">
                  {orphans.map((node) => renderNode(node.id, 0))}
                </div>
              </div>
            ) : null}
          </div>
        </PanCanvas>
      </div>
    </div>
  );
}
