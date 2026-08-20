"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent,
  type ReactNode,
} from "react";
import { CheckCircle2, FlaskConical, Minus, Plus, Trash2, X } from "lucide-react";
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

type Selection =
  | { kind: "node"; nodeId: string }
  | { kind: "option"; nodeId: string; optionId: string };

export type TechAssistHistoryApi = {
  undo: () => void;
  redo: () => void;
};

type HistorySnapshot = {
  nodes: EditorNode[];
  entryNodeId: string;
};

const HISTORY_LIMIT = 50;

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.5;
/** Button +/- step (10%). */
const ZOOM_STEP = 0.1;
/** Wheel/pinch: smaller = slower trackpad zoom. */
const ZOOM_WHEEL_SENSITIVITY = 0.0012;

function clampZoom(value: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 1000) / 1000));
}

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

function PanCanvas({
  children,
  zoom,
  onZoomChange,
}: {
  children: ReactNode;
  zoom: number;
  onZoomChange: (zoom: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const [grabbing, setGrabbing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      // Proportional to delta so trackpad pinch zooms smoothly; buttons still use ZOOM_STEP.
      const next = clampZoom(zoomRef.current - e.deltaY * ZOOM_WHEEL_SENSITIVITY);
      if (next !== zoomRef.current) onZoomChange(next);
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onZoomChange]);

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
        "h-full min-h-0 overflow-auto bg-muted/30",
        grabbing ? "cursor-grabbing select-none" : "cursor-grab"
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div
        className="inline-block min-h-full min-w-full p-8"
        style={{
          width: "max-content",
          transform: `scale(${zoom})`,
          transformOrigin: "top center",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ZoomControls({
  zoom,
  onZoomChange,
}: {
  zoom: number;
  onZoomChange: (zoom: number) => void;
}) {
  return (
    <div className="absolute bottom-4 left-4 z-10 flex items-center gap-1 rounded-md border border-border bg-background/95 px-1 py-1 shadow-sm backdrop-blur-sm">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        aria-label="Zoom out"
        disabled={zoom <= ZOOM_MIN}
        onClick={() => onZoomChange(clampZoom(zoom - ZOOM_STEP))}
      >
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <span className="min-w-[3rem] text-center text-xs tabular-nums text-muted-foreground">
        {Math.round(zoom * 100)}%
      </span>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        aria-label="Zoom in"
        disabled={zoom >= ZOOM_MAX}
        onClick={() => onZoomChange(clampZoom(zoom + ZOOM_STEP))}
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/** Half of gap-12 so horizontal rails bridge the column gaps. */
const BRANCH_GAP_HALF = "1.5rem";

/**
 * Tree fork whose vertical drops sit on each column’s center (same flex + gap as
 * the branch row), instead of equal-width slots that drift off the chips.
 */
function BranchFork({ columns }: { columns: ReactNode[] }) {
  const count = columns.length;
  if (count <= 0) return null;
  if (count === 1) {
    return (
      <div className="flex w-max flex-col items-center">
        <VerticalConnector taller />
        {columns[0]}
      </div>
    );
  }
  return (
    <div className="flex w-max flex-col items-center">
      <div className="h-3 w-px bg-border" />
      <div className="flex items-start gap-12">
        {columns.map((column, i) => (
          <div key={i} className="relative flex flex-col items-center">
            <div
              className="absolute top-0 h-px bg-border"
              style={
                i === 0
                  ? { left: "50%", right: `-${BRANCH_GAP_HALF}` }
                  : i === count - 1
                    ? { left: `-${BRANCH_GAP_HALF}`, right: "50%" }
                    : { left: `-${BRANCH_GAP_HALF}`, right: `-${BRANCH_GAP_HALF}` }
              }
            />
            <div className="h-7 w-px bg-border" />
            {column}
          </div>
        ))}
      </div>
    </div>
  );
}

type BranchColumn =
  | {
      kind: "linked";
      options: EditorOption[];
      nextNodeId: string;
      /** Inline under this branch; otherwise a jump link to a step hosted elsewhere. */
      inline: boolean;
    }
  | { kind: "open"; option: EditorOption }
  | { kind: "add" };

/**
 * First BFS edge into each step owns the inline tree placement; later edges are jumps.
 */
function computePrimaryParent(
  entryId: string | undefined,
  byId: Map<string, EditorNode>
): Map<string, string> {
  const primaryParent = new Map<string, string>();
  if (!entryId || !byId.has(entryId)) return primaryParent;

  const queue: string[] = [entryId];
  const visited = new Set<string>();

  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = byId.get(id);
    if (!node) continue;
    for (const option of node.options) {
      const target = option.nextNodeId;
      if (!target || !byId.has(target)) continue;
      if (!primaryParent.has(target)) {
        primaryParent.set(target, id);
        queue.push(target);
      }
    }
  }
  return primaryParent;
}

/** Sibling options that share a next step become one column with OR chips. */
function groupBranchColumns(
  options: EditorOption[],
  parentId: string,
  nodeExists: (id: string) => boolean,
  primaryParent: Map<string, string>
): BranchColumn[] {
  const columns: BranchColumn[] = [];
  const targetIndex = new Map<string, number>();

  for (const option of options) {
    const target =
      option.nextNodeId && nodeExists(option.nextNodeId) ? option.nextNodeId : "";
    if (target) {
      const existing = targetIndex.get(target);
      if (existing !== undefined) {
        const col = columns[existing];
        if (col?.kind === "linked") col.options.push(option);
        continue;
      }
      targetIndex.set(target, columns.length);
      columns.push({
        kind: "linked",
        options: [option],
        nextNodeId: target,
        inline: primaryParent.get(target) === parentId,
      });
      continue;
    }
    columns.push({ kind: "open", option });
  }

  columns.push({ kind: "add" });
  return columns;
}

type JumpEdge = {
  key: string;
  fromKey: string;
  toNodeId: string;
};

function buildJumpPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const bow =
    (dx === 0 ? (x1 > x2 ? -1 : 1) : Math.sign(dx)) *
    Math.min(160, Math.max(56, Math.abs(dx) * 0.35 + (Math.abs(dx) < 48 ? 72 : 0)));
  const cy1 = y1 + Math.max(32, Math.abs(dy) * 0.28);
  const cy2 = y2 - Math.max(20, Math.abs(dy) * 0.18);
  const cx1 = x1 + (Math.abs(dx) < 64 ? bow : dx * 0.15);
  const cx2 = x2 - (Math.abs(dx) < 64 ? bow * 0.35 : dx * 0.15);
  return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
}

function CrossLinkLayer({
  surfaceRef,
  edges,
  zoom,
  layoutKey,
}: {
  surfaceRef: MutableRefObject<HTMLDivElement | null>;
  edges: JumpEdge[];
  zoom: number;
  layoutKey: string;
}) {
  const [paths, setPaths] = useState<{ key: string; d: string }[]>([]);

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) {
      setPaths([]);
      return;
    }

    function measure() {
      const root = surfaceRef.current;
      if (!root) return;
      const rootRect = root.getBoundingClientRect();
      const scale = root.offsetWidth > 0 ? rootRect.width / root.offsetWidth : zoom || 1;
      const next: { key: string; d: string }[] = [];

      for (const edge of edges) {
        const fromEl = root.querySelector<HTMLElement>(
          `[data-flow-jump-from="${CSS.escape(edge.fromKey)}"]`
        );
        const toEl = root.querySelector<HTMLElement>(
          `[data-flow-node="${CSS.escape(edge.toNodeId)}"]`
        );
        if (!fromEl || !toEl) continue;
        const fromRect = fromEl.getBoundingClientRect();
        const toRect = toEl.getBoundingClientRect();
        const x1 = (fromRect.left + fromRect.width / 2 - rootRect.left) / scale;
        const y1 = (fromRect.bottom - rootRect.top) / scale;
        const x2 = (toRect.left + toRect.width / 2 - rootRect.left) / scale;
        const y2 = (toRect.top - rootRect.top) / scale;
        next.push({ key: edge.key, d: buildJumpPath(x1, y1, x2, y2) });
      }
      setPaths(next);
    }

    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(surface);
    const id = requestAnimationFrame(measure);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(id);
    };
  }, [edges, zoom, layoutKey, surfaceRef]);

  if (paths.length === 0) return null;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-0 overflow-visible text-sky-500/70"
      aria-hidden
    >
      {paths.map((path) => (
        <path
          key={path.key}
          d={path.d}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="7 5"
        />
      ))}
    </svg>
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

function AnyOfEditor({
  anyOf,
  onChange,
}: {
  anyOf: EditorMatchCondition[];
  onChange: (anyOf: EditorMatchCondition[]) => void;
}) {
  return (
    <div className="space-y-2 rounded-md border border-dashed border-border bg-muted/20 p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Also match if (OR)</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange([...anyOf, emptyCondition()])}
        >
          <Plus className="mr-1 h-3 w-3" />
          OR
        </Button>
      </div>
      {anyOf.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Optional. Add another condition so this branch is taken if either match is true.
        </p>
      ) : null}
      {anyOf.map((alt, ai) => (
        <div key={alt.id} className="space-y-2 rounded-md border border-border bg-background p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              OR condition {ai + 1}
            </span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => onChange(anyOf.filter((row) => row.id !== alt.id))}
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
                  const next = [...anyOf];
                  next[ai] = { ...alt, match };
                  onChange(next);
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
                    const next = [...anyOf];
                    next[ai] = { ...alt, label: e.target.value };
                    onChange(next);
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
                    const next = [...anyOf];
                    next[ai] = { ...alt, value: e.target.value };
                    onChange(next);
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
                      const next = [...anyOf];
                      next[ai] = { ...alt, min: e.target.value };
                      onChange(next);
                    }}
                  />
                </label>
                <label className="text-xs">
                  Max
                  <Input
                    className="mt-1"
                    value={alt.max}
                    onChange={(e) => {
                      const next = [...anyOf];
                      next[ai] = { ...alt, max: e.target.value };
                      onChange(next);
                    }}
                  />
                </label>
              </>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function OptionDetailPanel({
  node,
  option,
  optionIndex,
  nodes,
  onClose,
  updateNode,
  recordHistory,
}: {
  node: EditorNode;
  option: EditorOption;
  optionIndex: number;
  nodes: EditorNode[];
  onClose: () => void;
  updateNode: (id: string, patch: Partial<EditorNode>) => void;
  recordHistory: () => void;
}) {
  function updateOption(patch: Partial<EditorOption>, structural = false) {
    if (structural) recordHistory();
    const options = [...node.options];
    options[optionIndex] = { ...option, ...patch };
    updateNode(node.id, { options });
  }

  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Branch option
          </p>
          <h3 className="font-semibold text-foreground">Edit option</h3>
        </div>
        <Button type="button" size="icon" variant="ghost" aria-label="Close" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <label className="block text-sm">
          Label
          <Input
            className="mt-1"
            placeholder="Option label (shown to AI)"
            value={option.label}
            onChange={(e) => updateOption({ label: e.target.value })}
          />
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs">
            Match type
            <MatchTypeSelect
              value={option.match}
              onChange={(match) => updateOption({ match })}
            />
          </label>
          {matchNeedsValue(option.match) ? (
            <label className="text-xs">
              Value
              <Input
                className="mt-1"
                value={option.value}
                onChange={(e) => updateOption({ value: e.target.value })}
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
                  onChange={(e) => updateOption({ min: e.target.value })}
                />
              </label>
              <label className="text-xs">
                Max
                <Input
                  className="mt-1"
                  value={option.max}
                  onChange={(e) => updateOption({ max: e.target.value })}
                />
              </label>
            </>
          ) : null}
        </div>
        <AnyOfEditor anyOf={option.anyOf} onChange={(anyOf) => updateOption({ anyOf })} />
        <label className="block text-xs">
          Goes to
          <p className="mt-0.5 text-[11px] font-normal text-muted-foreground">
            Pick any existing diagnostic or resolution — even one already used on another
            branch. Extra links draw as jump lines.
          </p>
          <select
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            value={option.nextNodeId}
            onChange={(e) => updateOption({ nextNodeId: e.target.value }, true)}
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
        <div className="border-t border-border pt-3">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => {
              recordHistory();
              updateNode(node.id, {
                options: node.options.filter((o) => o.id !== option.id),
              });
              onClose();
            }}
          >
            Delete option
          </Button>
        </div>
      </div>
    </aside>
  );
}

function DetailPanel({
  selection,
  nodes,
  entryNodeId,
  onClose,
  updateNode,
  removeNode,
  onEntryChange,
  recordHistory,
}: {
  selection: Selection;
  nodes: EditorNode[];
  entryNodeId: string;
  onClose: () => void;
  updateNode: (id: string, patch: Partial<EditorNode>) => void;
  removeNode: (id: string) => void;
  onEntryChange: (id: string) => void;
  recordHistory: () => void;
}) {
  if (selection.kind === "node") {
    const node = nodes.find((n) => n.id === selection.nodeId);
    if (!node) return null;
    const isDiagnostic = node.type === "DIAGNOSTIC";
    const isEntry = (entryNodeId || nodes[0]?.id) === node.id;

    return (
      <aside className="flex w-[360px] shrink-0 flex-col border-l border-border bg-background">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {isDiagnostic ? "Diagnostic" : "Resolution"}
            </p>
            <h3 className="font-semibold text-foreground">Edit step</h3>
          </div>
          <Button type="button" size="icon" variant="ghost" aria-label="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {isEntry ? (
            <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
              This is the starting step for this issue.
              {nodes.length > 1 ? (
                <>
                  {" "}
                  Change it from the <span className="font-medium">Issue start</span> card on the
                  canvas.
                </>
              ) : null}
            </p>
          ) : null}
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
          {nodes.length > 1 && isEntry ? (
            <label className="block text-sm">
              Starting step
              <select
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                value={entryNodeId || nodes[0]?.id || ""}
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
          <div className="border-t border-border pt-3">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => {
                removeNode(node.id);
                onClose();
              }}
            >
              Delete step
            </Button>
          </div>
        </div>
      </aside>
    );
  }

  const parentNode = nodes.find((n) => n.id === selection.nodeId);
  const optionIndex =
    parentNode?.options.findIndex((o) => o.id === selection.optionId) ?? -1;
  const currentOption =
    parentNode && optionIndex >= 0 ? parentNode.options[optionIndex] : null;
  if (!parentNode || !currentOption) return null;

  return (
    <OptionDetailPanel
      node={parentNode}
      option={currentOption}
      optionIndex={optionIndex}
      nodes={nodes}
      onClose={onClose}
      updateNode={updateNode}
      recordHistory={recordHistory}
    />
  );
}

type Props = {
  nodes: EditorNode[];
  entryNodeId: string;
  onChange: (nodes: EditorNode[]) => void;
  onEntryChange: (id: string) => void;
  historyKey?: string;
  historyRef?: MutableRefObject<TechAssistHistoryApi | null>;
  onHistoryStateChange?: (state: { canUndo: boolean; canRedo: boolean }) => void;
};

function cloneSnapshot(nodes: EditorNode[], entryNodeId: string): HistorySnapshot {
  return {
    nodes: structuredClone(nodes),
    entryNodeId,
  };
}

export function TechAssistFlowEditor({
  nodes,
  entryNodeId,
  onChange,
  onEntryChange,
  historyKey,
  historyRef,
  onHistoryStateChange,
}: Props) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [zoom, setZoom] = useState(1);
  const pastRef = useRef<HistorySnapshot[]>([]);
  const futureRef = useRef<HistorySnapshot[]>([]);
  const applyingHistoryRef = useRef(false);
  const nodesRef = useRef(nodes);
  const entryRef = useRef(entryNodeId);
  nodesRef.current = nodes;
  entryRef.current = entryNodeId;

  const notifyHistory = useCallback(() => {
    onHistoryStateChange?.({
      canUndo: pastRef.current.length > 0,
      canRedo: futureRef.current.length > 0,
    });
  }, [onHistoryStateChange]);

  const recordHistory = useCallback(() => {
    if (applyingHistoryRef.current) return;
    pastRef.current.push(cloneSnapshot(nodesRef.current, entryRef.current));
    if (pastRef.current.length > HISTORY_LIMIT) pastRef.current.shift();
    futureRef.current = [];
    notifyHistory();
  }, [notifyHistory]);

  const undo = useCallback(() => {
    if (!pastRef.current.length) return;
    futureRef.current.push(cloneSnapshot(nodesRef.current, entryRef.current));
    const prev = pastRef.current.pop()!;
    applyingHistoryRef.current = true;
    onChange(prev.nodes);
    onEntryChange(prev.entryNodeId);
    setSelection(null);
    applyingHistoryRef.current = false;
    notifyHistory();
  }, [notifyHistory, onChange, onEntryChange]);

  const redo = useCallback(() => {
    if (!futureRef.current.length) return;
    pastRef.current.push(cloneSnapshot(nodesRef.current, entryRef.current));
    const next = futureRef.current.pop()!;
    applyingHistoryRef.current = true;
    onChange(next.nodes);
    onEntryChange(next.entryNodeId);
    setSelection(null);
    applyingHistoryRef.current = false;
    notifyHistory();
  }, [notifyHistory, onChange, onEntryChange]);

  useEffect(() => {
    pastRef.current = [];
    futureRef.current = [];
    notifyHistory();
  }, [historyKey, notifyHistory]);

  useEffect(() => {
    if (!historyRef) return;
    historyRef.current = { undo, redo };
    return () => {
      historyRef.current = null;
    };
  }, [historyRef, undo, redo]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, select, [contenteditable=true]")
      ) {
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const startId = entryNodeId || nodes[0]?.id;

  const primaryParent = useMemo(
    () => computePrimaryParent(startId, byId),
    [startId, byId]
  );

  const jumpEdges = useMemo(() => {
    const edges: JumpEdge[] = [];
    const seen = new Set<string>();
    for (const node of nodes) {
      const byTarget = new Map<string, EditorOption[]>();
      for (const option of node.options) {
        const target = option.nextNodeId;
        if (!target || !byId.has(target)) continue;
        if (primaryParent.get(target) === node.id) continue;
        const list = byTarget.get(target) ?? [];
        list.push(option);
        byTarget.set(target, list);
      }
      for (const [toNodeId] of byTarget) {
        const fromKey = `${node.id}::${toNodeId}`;
        if (seen.has(fromKey)) continue;
        seen.add(fromKey);
        edges.push({
          key: fromKey,
          fromKey,
          toNodeId,
        });
      }
    }
    return edges;
  }, [nodes, byId, primaryParent]);

  const layoutKey = useMemo(
    () =>
      `${zoom}:${selection?.kind ?? ""}:${
        selection && "nodeId" in selection ? selection.nodeId : ""
      }:${nodes.map((n) => `${n.id}:${n.options.map((o) => o.nextNodeId).join(",")}`).join("|")}`,
    [nodes, zoom, selection]
  );

  const flowSurfaceRef = useRef<HTMLDivElement | null>(null);

  const reachable = useMemo(() => {
    const seen = new Set<string>();
    const walk = (id: string | null | undefined) => {
      if (!id || seen.has(id)) return;
      const node = byId.get(id);
      if (!node) return;
      seen.add(id);
      for (const option of node.options) walk(option.nextNodeId);
    };
    walk(startId);
    return seen;
  }, [byId, startId]);

  const orphans = nodes.filter((n) => !reachable.has(n.id));

  function isNodeSelected(nodeId: string) {
    return selection?.kind === "node" && selection.nodeId === nodeId;
  }

  function isOptionSelected(nodeId: string, optionId: string) {
    return (
      selection?.kind === "option" &&
      selection.nodeId === nodeId &&
      selection.optionId === optionId
    );
  }

  function clearSelectionIfRemoved(nodeId: string, optionId?: string) {
    if (!selection) return;
    if (selection.kind === "node" && selection.nodeId === nodeId) setSelection(null);
    if (
      selection.kind === "option" &&
      (selection.nodeId === nodeId || selection.optionId === optionId)
    ) {
      setSelection(null);
    }
  }

  function updateNode(id: string, patch: Partial<EditorNode>) {
    onChange(nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }

  function removeNode(id: string) {
    recordHistory();
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
    clearSelectionIfRemoved(id);
  }

  function addChild(parentId: string, optionIds: string[], type: EditorNodeType) {
    recordHistory();
    const child =
      type === "RESOLUTION" ? emptyResolution(nodes.length) : emptyDiagnostic(nodes.length);
    const idSet = new Set(optionIds);
    onChange(
      nodes
        .map((n) =>
          n.id === parentId
            ? {
                ...n,
                options: n.options.map((o) =>
                  idSet.has(o.id) ? { ...o, nextNodeId: child.id } : o
                ),
              }
            : n
        )
        .concat(child)
    );
    setSelection({ kind: "node", nodeId: child.id });
  }

  function insertDiagnosticBetween(parentId: string, optionIds: string[]) {
    const parent = nodes.find((n) => n.id === parentId);
    if (!parent || optionIds.length === 0) return;
    const idSet = new Set(optionIds);
    const first = parent.options.find((o) => idSet.has(o.id));
    if (!first) return;
    recordHistory();
    const previousNext = first.nextNodeId;
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
                  idSet.has(o.id) ? { ...o, nextNodeId: child.id } : o
                ),
              }
            : n
        )
        .concat(child)
    );
    setSelection({ kind: "node", nodeId: child.id });
  }

  function addOptionBranch(nodeId: string) {
    const node = byId.get(nodeId);
    if (!node) return;
    recordHistory();
    const option = emptyOption({ match: "label" });
    updateNode(nodeId, { options: [...node.options, option] });
    setSelection({ kind: "option", nodeId, optionId: option.id });
  }

  function renderOptionChip(nodeId: string, option: EditorOption) {
    const optionSelected = isOptionSelected(nodeId, option.id);
    return (
      <button
        type="button"
        key={option.id}
        className={cn(
          "max-w-[14rem] rounded-full border px-3 py-1.5 text-center text-xs font-medium transition-colors",
          optionSelected
            ? "border-sky-400 bg-sky-50 text-sky-900 ring-2 ring-sky-300 ring-offset-1"
            : "border-border bg-muted/50 hover:border-sky-300 hover:bg-sky-50/60"
        )}
        onClick={(e) => {
          e.stopPropagation();
          setSelection({ kind: "option", nodeId, optionId: option.id });
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {optionBranchLabel(option)}
      </button>
    );
  }

  function renderJumpTarget(parentId: string, nextNodeId: string, options: EditorOption[]) {
    const target = byId.get(nextNodeId);
    const fromKey = `${parentId}::${nextNodeId}`;
    const label =
      target?.title?.trim() ||
      (target?.type === "RESOLUTION" ? "Resolution" : "Diagnostic");
    return (
      <div className="mt-1 flex flex-col items-center">
        <div className="h-3 w-px bg-border" />
        <button
          type="button"
          data-flow-jump-from={fromKey}
          className="max-w-[14rem] rounded-full border border-dashed border-sky-400 bg-sky-50/80 px-3 py-1.5 text-center text-xs font-medium text-sky-900 hover:bg-sky-100"
          onClick={(e) => {
            e.stopPropagation();
            setSelection({ kind: "node", nodeId: nextNodeId });
          }}
          onPointerDown={(e) => e.stopPropagation()}
          title="Jumps to an existing step elsewhere in the flow"
        >
          → {label}
        </button>
        {/* Keep option chips selectable above; this is the visual jump endpoint. */}
        <span className="sr-only">
          Links from {options.map((o) => o.label || o.id).join(" OR ")}
        </span>
      </div>
    );
  }

  function renderNode(
    nodeId: string,
    depth: number,
    pathSeen: Set<string> = new Set(),
    rendered: Set<string> = new Set()
  ): ReactNode {
    const node = byId.get(nodeId);
    if (!node) return null;
    if (pathSeen.has(nodeId) || rendered.has(nodeId)) {
      return null;
    }
    rendered.add(nodeId);
    const nextSeen = new Set(pathSeen);
    nextSeen.add(nodeId);
    const isDiagnostic = node.type === "DIAGNOSTIC";
    const optionCount = node.options.length;
    const selected = isNodeSelected(node.id);

    return (
      <div key={node.id} className="relative z-[1] flex w-max flex-col items-center">
        <button
          type="button"
          data-flow-node={node.id}
          className={cn(
            "relative z-[1] w-72 shrink-0 rounded-lg border bg-white p-3 text-left shadow-sm transition-shadow",
            isDiagnostic ? "border-sky-200" : "border-emerald-200",
            selected && "ring-2 ring-primary ring-offset-2"
          )}
          onClick={() => setSelection({ kind: "node", nodeId: node.id })}
        >
          <span className="flex items-start gap-3">
            <span
              className={cn(
                "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                isDiagnostic ? "bg-sky-100 text-sky-700" : "bg-emerald-100 text-emerald-700"
              )}
            >
              {isDiagnostic ? (
                <FlaskConical className="h-3.5 w-3.5" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {isDiagnostic ? "Diagnostic" : "Resolution"}
              </span>
              <span className="block text-sm font-semibold text-foreground">
                {node.title || (isDiagnostic ? "Untitled test" : "Untitled resolution")}
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {node.body || (isDiagnostic ? "No test yet" : "No instructions yet")}
                {isDiagnostic && optionCount > 0
                  ? ` · ${optionCount} option${optionCount === 1 ? "" : "s"}`
                  : ""}
              </span>
            </span>
          </span>
        </button>

        {isDiagnostic ? (
          <BranchFork
            columns={groupBranchColumns(
              node.options,
              node.id,
              (id) => byId.has(id),
              primaryParent
            ).map((column) => {
              if (column.kind === "add") {
                return (
                  <div key="add" className="flex w-max min-w-72 flex-col items-center">
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
                );
              }

              if (column.kind === "open") {
                const option = column.option;
                return (
                  <div key={option.id} className="flex w-max min-w-72 flex-col items-center">
                    <div className="mb-1 flex flex-col items-center gap-1">
                      {renderOptionChip(node.id, option)}
                    </div>
                    <NextStepActions
                      onDiagnostic={() => addChild(node.id, [option.id], "DIAGNOSTIC")}
                      onResolution={() => addChild(node.id, [option.id], "RESOLUTION")}
                    />
                  </div>
                );
              }

              const optionIds = column.options.map((o) => o.id);
              return (
                <div
                  key={`${column.nextNodeId}:${column.inline ? "inline" : "jump"}`}
                  className="flex w-max min-w-72 flex-col items-center"
                >
                  <div className="mb-1 flex flex-col items-center gap-1">
                    {column.options.map((option, i) => (
                      <div key={option.id} className="flex flex-col items-center gap-1">
                        {i > 0 ? (
                          <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                            OR
                          </span>
                        ) : null}
                        {renderOptionChip(node.id, option)}
                      </div>
                    ))}
                  </div>
                  {column.inline ? (
                    <>
                      <InsertDiagnosticButton
                        onClick={() => insertDiagnosticBetween(node.id, optionIds)}
                      />
                      {depth < 12
                        ? renderNode(column.nextNodeId, depth + 1, nextSeen, rendered)
                        : null}
                    </>
                  ) : (
                    renderJumpTarget(node.id, column.nextNodeId, column.options)
                  )}
                </div>
              );
            })}
          />
        ) : null}
      </div>
    );
  }

  const treeRendered = new Set<string>();

  return (
    <div className="flex h-full min-h-0">
      <div className="relative min-h-0 min-w-0 flex-1">
        <PanCanvas zoom={zoom} onZoomChange={setZoom}>
          <div ref={flowSurfaceRef} className="relative flex flex-col items-center">
            <CrossLinkLayer
              surfaceRef={flowSurfaceRef}
              edges={jumpEdges}
              zoom={zoom}
              layoutKey={layoutKey}
            />
            <div className="relative z-[1] flex flex-col items-center">
              <div className="w-full max-w-sm rounded-lg border border-border bg-background/90 p-4 text-center shadow-sm">
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
                  {renderNode(startId, 0, new Set(), treeRendered)}
                </>
              ) : (
                <div className="mt-4 flex flex-col items-center gap-2">
                  <VerticalConnector />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        recordHistory();
                        const node = emptyDiagnostic(0);
                        onChange([node]);
                        onEntryChange(node.id);
                        setSelection({ kind: "node", nodeId: node.id });
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
                    {orphans.map((node) =>
                      renderNode(node.id, 0, new Set(), treeRendered)
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </PanCanvas>
        <ZoomControls zoom={zoom} onZoomChange={setZoom} />
      </div>

      {selection ? (
        <DetailPanel
          selection={selection}
          nodes={nodes}
          entryNodeId={entryNodeId}
          onClose={() => setSelection(null)}
          updateNode={updateNode}
          removeNode={removeNode}
          onEntryChange={onEntryChange}
          recordHistory={recordHistory}
        />
      ) : null}
    </div>
  );
}
