import { Prisma, TechAssistNodeType, TechAssistSessionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type TechAssistOptionMatch =
  | "yes"
  | "no"
  | "eq"
  | "lt"
  | "gt"
  | "lte"
  | "gte"
  | "between"
  | "label";

/** One match rule used by a branch option (primary or OR alternative). */
export type TechAssistMatchCondition = {
  match?: TechAssistOptionMatch;
  /** Free-text phrase when match is "label" (OR alts often differ from the display label). */
  label?: string;
  value?: number | string;
  min?: number;
  max?: number;
};

export type TechAssistOption = {
  id: string;
  label: string;
  match?: TechAssistOptionMatch;
  value?: number | string;
  min?: number;
  max?: number;
  /** Additional match rules — branch is taken if the primary rule OR any of these match. */
  anyOf?: TechAssistMatchCondition[];
  nextNodeId?: string | null;
};

export type TechAssistNodeConfig = {
  tips?: string;
  options?: TechAssistOption[];
  defaultNextNodeId?: string | null;
  /** Legacy fields kept for older workflows */
  inputType?: "number" | "yes_no" | "choice" | "text";
  unit?: string;
  prompt?: string;
  choices?: string[];
  source?: "previous";
  rules?: Array<{
    op?: "lt" | "gt" | "lte" | "gte" | "eq" | "between" | "in";
    value?: number | string;
    min?: number;
    max?: number;
    values?: string[];
    nextNodeId?: string | null;
  }>;
};

export function asConfig(raw: unknown): TechAssistNodeConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as TechAssistNodeConfig;
}

function normalizeResultText(result: unknown) {
  return String(result ?? "")
    .trim()
    .toLowerCase();
}

function resultNumber(result: unknown): number | null {
  if (typeof result === "number" && Number.isFinite(result)) return result;
  const text = String(result ?? "").trim();
  // Prefer a standalone measurement when speech includes units ("30 ohms", "about 24.5").
  const embedded = text.match(/-?\d+(?:\.\d+)?/);
  if (embedded && !Number.isNaN(Number(embedded[0]))) return Number(embedded[0]);
  if (!text || Number.isNaN(Number(text))) return null;
  return Number(text);
}

const MATCH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "does",
  "did",
  "do",
  "for",
  "from",
  "i",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "so",
  "that",
  "the",
  "this",
  "to",
  "was",
  "we",
]);

/** Light stemming so spoken tense variants still match option labels. */
function stemToken(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ing") && word.length > 5) return word.slice(0, -3);
  if (word.endsWith("ed") && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("es") && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("s") && word.length > 3 && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function significantTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map(stemToken)
    .filter((t) => t.length > 1 && !MATCH_STOP_WORDS.has(t));
}

/** True when most tokens of the shorter phrase appear in the longer (spoken paraphrase). */
export function phrasesOverlap(a: string, b: string): boolean {
  const ta = significantTokens(a);
  const tb = significantTokens(b);
  if (!ta.length || !tb.length) return false;
  const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const longerSet = new Set(longer);
  const hits = shorter.filter((t) => longerSet.has(t)).length;
  const need = Math.max(1, Math.ceil(shorter.length * 0.75));
  return hits >= need;
}

const YES_EXACT = new Set(["yes", "y", "true", "1", "yeah", "yep", "yup", "affirmative"]);
const NO_EXACT = new Set(["no", "n", "false", "0", "nope", "nah"]);

function hasNegation(text: string): boolean {
  return /\b(not|no|nope|nah|never|doesn't|doesnt|didn't|didnt|won't|wont|isn't|isnt|can't|cant|cannot)\b/.test(
    text
  );
}

/** Spoken yes/no beyond exact tokens (e.g. "it operated manually" → yes). */
export function spokenYesNo(text: string): "yes" | "no" | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  if (YES_EXACT.has(t) || /^(yes|yeah|yep|yup)\b/.test(t)) return "yes";
  if (NO_EXACT.has(t) || /^(no|nope|nah)\b/.test(t)) return "no";
  if (hasNegation(t)) {
    if (/\b(does not|doesn't|did not|didn't|will not|won't|is not|isn't|cannot|can't)\b/.test(t)) {
      return "no";
    }
    if (/^(no|not)\b/.test(t)) return "no";
  }
  // Affirmative restatements without negation: "it does", "valve operated manually", "it opened"
  if (
    /\b(it (does|did|will|works|worked|opens?|opened|operates?|operated)|works|worked|opens?|opened|operates?|operated)\b/.test(
      t
    ) &&
    !hasNegation(t)
  ) {
    return "yes";
  }
  return null;
}

function conditionMatches(
  condition: TechAssistMatchCondition,
  result: unknown,
  fallbackLabel = ""
): boolean {
  const match = condition.match ?? "label";
  const text = normalizeResultText(result);
  const num = resultNumber(result);
  const label = String(condition.label ?? fallbackLabel)
    .trim()
    .toLowerCase();

  if (match === "yes") {
    if (YES_EXACT.has(text) || (label && text === label)) return true;
    if (spokenYesNo(text) === "yes") return true;
    return label ? phrasesOverlap(text, label) : false;
  }
  if (match === "no") {
    if (NO_EXACT.has(text) || (label && text === label)) return true;
    if (spokenYesNo(text) === "no") return true;
    return label ? phrasesOverlap(text, label) : false;
  }
  if (match === "lt" && num != null && condition.value != null) {
    return num < Number(condition.value);
  }
  if (match === "gt" && num != null && condition.value != null) {
    return num > Number(condition.value);
  }
  if (match === "lte" && num != null && condition.value != null) {
    return num <= Number(condition.value);
  }
  if (match === "gte" && num != null && condition.value != null) {
    return num >= Number(condition.value);
  }
  if (match === "between" && num != null && condition.min != null && condition.max != null) {
    return num >= condition.min && num <= condition.max;
  }
  if (match === "eq") {
    if (num != null && condition.value != null && typeof condition.value !== "string") {
      return num === Number(condition.value);
    }
    const target = String(condition.value ?? label).toLowerCase();
    return text === target || phrasesOverlap(text, target);
  }
  // label / free-text: match option label or spoken paraphrase
  if (!label) return false;
  return text === label || text.includes(label) || label.includes(text) || phrasesOverlap(text, label);
}

export function optionMatches(option: TechAssistOption, result: unknown): boolean {
  if (
    conditionMatches(
      {
        match: option.match,
        label: option.label,
        value: option.value,
        min: option.min,
        max: option.max,
      },
      result,
      option.label
    )
  ) {
    return true;
  }
  for (const alt of option.anyOf ?? []) {
    if (conditionMatches(alt, result, alt.label ?? option.label)) return true;
  }
  return false;
}

function conditionPublicLabel(condition: TechAssistMatchCondition, fallback = ""): string {
  const match = condition.match ?? "label";
  if (match === "yes") return "Yes";
  if (match === "no") return "No";
  if (match === "between" && condition.min != null && condition.max != null) {
    return `${condition.min}–${condition.max}`;
  }
  if (match === "lt" && condition.value != null) return `< ${condition.value}`;
  if (match === "gt" && condition.value != null) return `> ${condition.value}`;
  if (match === "lte" && condition.value != null) return `≤ ${condition.value}`;
  if (match === "gte" && condition.value != null) return `≥ ${condition.value}`;
  if (match === "eq" && condition.value != null) return String(condition.value);
  return String(condition.label ?? fallback).trim();
}

/** Label shown to the model for a branch, including OR alternatives. */
export function optionPublicLabel(option: TechAssistOption): string {
  const primary = option.label.trim() || conditionPublicLabel(option, "Option");
  const alts = (option.anyOf ?? [])
    .map((alt) => conditionPublicLabel(alt))
    .filter((text) => text && text.toLowerCase() !== primary.toLowerCase());
  if (!alts.length) return primary || "Option";
  return [primary, ...alts].join(" OR ");
}

export type ResolveDiagnosticNext = {
  nextNodeId: string | null;
  /** False when the diagnostic listed options and none matched the result. */
  matched: boolean;
  matchedOptionId?: string | null;
};

/** Resolve next node from a diagnostic's options (new model) or legacy BRANCH rules. */
export function resolveNextFromDiagnostic(
  config: TechAssistNodeConfig,
  result: unknown
): ResolveDiagnosticNext {
  const options = config.options ?? [];
  if (options.length > 0) {
    for (const option of options) {
      if (optionMatches(option, result)) {
        return {
          nextNodeId: option.nextNodeId ?? config.defaultNextNodeId ?? null,
          matched: true,
          matchedOptionId: option.id,
        };
      }
    }
    // Do not fall through to an arbitrary next node when options exist but none matched.
    return {
      nextNodeId: config.defaultNextNodeId ?? null,
      matched: Boolean(config.defaultNextNodeId),
      matchedOptionId: null,
    };
  }
  return { nextNodeId: evaluateBranch(config, result), matched: true };
}

export function evaluateBranch(config: TechAssistNodeConfig, result: unknown): string | null {
  const rules = config.rules ?? [];
  const num = resultNumber(result);
  const text = normalizeResultText(result);

  for (const rule of rules) {
    const op = rule.op ?? "eq";
    let ok = false;
    if (op === "lt" && num != null && rule.value != null) ok = num < Number(rule.value);
    else if (op === "gt" && num != null && rule.value != null) ok = num > Number(rule.value);
    else if (op === "lte" && num != null && rule.value != null) ok = num <= Number(rule.value);
    else if (op === "gte" && num != null && rule.value != null) ok = num >= Number(rule.value);
    else if (op === "between" && num != null && rule.min != null && rule.max != null) {
      ok = num >= rule.min && num <= rule.max;
    } else if (op === "in") {
      const values = (rule.values ?? []).map((v) => String(v).toLowerCase());
      ok = values.includes(text);
    } else if (op === "eq") {
      if (num != null && rule.value != null && typeof rule.value !== "string") {
        ok = num === Number(rule.value);
      } else {
        ok = text === String(rule.value ?? "").toLowerCase();
      }
    }
    if (ok && rule.nextNodeId) return rule.nextNodeId;
  }
  return config.defaultNextNodeId ?? null;
}

export function publicStep(node: {
  id: string;
  type: TechAssistNodeType;
  title: string;
  body: string;
  config: unknown;
}) {
  const config = asConfig(node.config);
  if (node.type === "RESOLUTION") {
    return {
      nodeId: node.id,
      type: "RESOLUTION" as const,
      title: node.title,
      instructions: node.body,
      done: true,
    };
  }
  if (node.type === "DIAGNOSTIC") {
    const options = (config.options ?? []).map((option) => ({
      id: option.id,
      label: optionPublicLabel(option),
    }));
    return {
      nodeId: node.id,
      type: "DIAGNOSTIC" as const,
      title: node.title,
      test: node.body || config.prompt || "",
      tips: config.tips?.trim() || null,
      options: options.length ? options : null,
      // legacy fields for older clients / prompts
      instructions: node.body || config.prompt || "",
      inputType: config.inputType ?? (options.length ? "choice" : "text"),
      unit: config.unit ?? null,
      choices: options.length ? options.map((o) => o.label) : (config.choices ?? null),
      done: false,
    };
  }
  // Legacy BRANCH — should not be asked; still return a safe shell
  return {
    nodeId: node.id,
    type: "BRANCH" as const,
    title: node.title,
    instructions: node.body || "Report the previous test result to continue.",
    done: false,
  };
}

function firstContentNode<
  T extends { id: string; type: TechAssistNodeType; sortOrder: number },
>(nodes: T[], entryNodeId: string | null): T | null {
  if (entryNodeId) {
    const entry = nodes.find((n) => n.id === entryNodeId);
    if (entry) return entry;
  }
  const askable = nodes.filter((n) => n.type !== "BRANCH");
  return [...askable].sort((a, b) => a.sortOrder - b.sortOrder)[0] ?? null;
}

function skipPastBranches(
  nodes: Array<{
    id: string;
    type: TechAssistNodeType;
    title: string;
    body: string;
    config: unknown;
    sortOrder: number;
  }>,
  startId: string | null,
  previousResult: unknown
): { node: (typeof nodes)[number]; usedResult: boolean } | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let current = startId ? byId.get(startId) ?? null : firstContentNode(nodes, startId);
  let used = false;
  const seen = new Set<string>();
  while (current && current.type === "BRANCH") {
    if (seen.has(current.id)) return null;
    seen.add(current.id);
    const nextId = evaluateBranch(asConfig(current.config), previousResult);
    used = true;
    current = nextId ? byId.get(nextId) ?? null : null;
  }
  return current ? { node: current, usedResult: used } : null;
}

/** Search issue title + description only. */
export async function matchTechIssues(companyId: string, query: string) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const issues = await prisma.techAssistIssue.findMany({
    where: { companyId, active: true },
    select: {
      id: true,
      name: true,
      description: true,
    },
    orderBy: { sortOrder: "asc" },
    take: 80,
  });

  const scored = issues
    .map((issue) => {
      const title = issue.name.toLowerCase();
      const description = (issue.description ?? "").toLowerCase();
      const hay = `${title} ${description}`;
      let score = 0;
      const tokens = q.split(/\s+/).filter((t) => t.length > 2);
      for (const token of tokens) {
        if (title.includes(token)) score += 3;
        else if (description.includes(token)) score += 2;
      }
      if (title.includes(q) || q.includes(title)) score += 6;
      if (hay.includes(q)) score += 4;
      return { issue, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  return scored.map(({ issue }) => ({
    id: issue.id,
    name: issue.name,
    description: issue.description,
  }));
}

/** Active diagnostic for a conversation (resume after voice reconnect). */
export async function getActiveTechAssistSession(opts: {
  companyId: string;
  userId: string;
  conversationId: string;
}) {
  const session = await prisma.techAssistSession.findFirst({
    where: {
      conversationId: opts.conversationId,
      companyId: opts.companyId,
      userId: opts.userId,
      status: TechAssistSessionStatus.ACTIVE,
    },
    include: {
      issue: { include: { nodes: { orderBy: { sortOrder: "asc" } } } },
    },
    orderBy: { updatedAt: "desc" },
  });
  if (!session) {
    return {
      ok: true as const,
      active: false as const,
      note: "No active technician assist session for this conversation.",
    };
  }

  const current =
    session.issue.nodes.find((n) => n.id === session.currentNodeId) ?? null;
  if (!current) {
    return {
      ok: true as const,
      active: false as const,
      note: "Active session is missing its current step.",
    };
  }

  return {
    ok: true as const,
    active: true as const,
    sessionId: session.id,
    issueId: session.issueId,
    issueName: session.issue.name,
    step: publicStep(current),
    note:
      "Resume this step only. If the technician just answered it, call continue_tech_assist with this sessionId. Do not restart, invent tests, or ask about steps not returned here.",
  };
}

/** Compact block for realtime session instructions after reconnect. */
export function formatActiveTechAssistForPrompt(
  active: Awaited<ReturnType<typeof getActiveTechAssistSession>>
): string {
  if (!active.ok || !active.active) return "";
  const step = active.step;
  const options =
    step.type === "DIAGNOSTIC" && Array.isArray(step.options) && step.options.length
      ? step.options.map((o) => o.label).join(" | ")
      : step.type === "DIAGNOSTIC" && Array.isArray(step.choices) && step.choices.length
        ? step.choices.join(" | ")
        : null;
  const lines = [
    "Active technician assist session (resume here — do not invent other tests):",
    `- sessionId: ${active.sessionId}`,
    `- issue: ${active.issueName}`,
    `- current step (${step.type}): ${step.title}`,
  ];
  if (step.type === "DIAGNOSTIC") {
    lines.push(`- test: ${step.test || step.instructions || ""}`);
    if (step.tips) lines.push(`- tips: ${step.tips}`);
    if (options) lines.push(`- options: ${options}`);
  } else if (step.type === "RESOLUTION") {
    lines.push(`- instructions: ${step.instructions}`);
  }
  lines.push(
    "When the technician answers this step, call continue_tech_assist with this sessionId and their result. Never ask about water pressure, ohms, or other checks unless this step says so."
  );
  return lines.join("\n");
}

export async function startTechAssistSession(opts: {
  companyId: string;
  userId: string;
  conversationId: string;
  issueId: string;
}) {
  const issue = await prisma.techAssistIssue.findFirst({
    where: { id: opts.issueId, companyId: opts.companyId, active: true },
    include: { nodes: { orderBy: { sortOrder: "asc" } } },
  });
  if (!issue) return { ok: false as const, error: "Issue not found" };
  if (!issue.nodes.length) return { ok: false as const, error: "This workflow has no steps yet" };

  // Same issue already in progress for this chat — resume instead of resetting to step 1.
  const existing = await prisma.techAssistSession.findFirst({
    where: {
      conversationId: opts.conversationId,
      companyId: opts.companyId,
      userId: opts.userId,
      issueId: issue.id,
      status: TechAssistSessionStatus.ACTIVE,
    },
    orderBy: { updatedAt: "desc" },
  });
  if (existing) {
    const current =
      issue.nodes.find((n) => n.id === existing.currentNodeId) ??
      firstContentNode(issue.nodes, issue.entryNodeId);
    if (current && current.type !== "BRANCH") {
      return {
        ok: true as const,
        sessionId: existing.id,
        issueName: issue.name,
        step: publicStep(current),
        resumed: true as const,
        note: "Resumed the active session for this issue at the current step. Do not restart from the beginning. Ask only for this step's result.",
      };
    }
  }

  const start = skipPastBranches(issue.nodes, issue.entryNodeId, null);
  const first = start?.node ?? firstContentNode(issue.nodes, issue.entryNodeId);
  if (!first || first.type === "BRANCH") {
    return { ok: false as const, error: "This workflow has no steps yet" };
  }

  await prisma.techAssistSession.updateMany({
    where: {
      conversationId: opts.conversationId,
      status: TechAssistSessionStatus.ACTIVE,
    },
    data: { status: TechAssistSessionStatus.ABANDONED },
  });

  const session = await prisma.techAssistSession.create({
    data: {
      companyId: opts.companyId,
      userId: opts.userId,
      conversationId: opts.conversationId,
      issueId: issue.id,
      currentNodeId: first.id,
      status: TechAssistSessionStatus.ACTIVE,
      history: [] as Prisma.InputJsonValue,
    },
  });

  return {
    ok: true as const,
    sessionId: session.id,
    issueName: issue.name,
    step: publicStep(first),
    resumed: false as const,
    note: "Ask the technician to complete only this step. Share tips if they are stuck. Do not mention later tests or the rest of the workflow.",
  };
}

export async function continueTechAssistSession(opts: {
  companyId: string;
  userId: string;
  sessionId: string;
  result: unknown;
}) {
  const session = await prisma.techAssistSession.findFirst({
    where: {
      id: opts.sessionId,
      companyId: opts.companyId,
      userId: opts.userId,
    },
    include: {
      issue: { include: { nodes: { orderBy: { sortOrder: "asc" } } } },
    },
  });
  if (!session) return { ok: false as const, error: "Session not found" };
  if (session.status !== TechAssistSessionStatus.ACTIVE) {
    return { ok: false as const, error: "This diagnostic session is already finished" };
  }

  const nodes = session.issue.nodes;
  const current = nodes.find((n) => n.id === session.currentNodeId) ?? null;
  if (!current) return { ok: false as const, error: "Current step is missing" };

  if (current.type === "RESOLUTION") {
    return {
      ok: true as const,
      sessionId: session.id,
      step: publicStep(current),
      note: "Workflow complete. Do not invent extra steps.",
    };
  }

  if (opts.result === undefined || opts.result === null || String(opts.result).trim() === "") {
    return {
      ok: true as const,
      sessionId: session.id,
      step: publicStep(current),
      note: "The technician has not given a result yet. Repeat only this step.",
    };
  }

  const history = Array.isArray(session.history) ? [...(session.history as unknown[])] : [];
  history.push({ nodeId: current.id, result: opts.result, at: new Date().toISOString() });

  let nextId: string | null = null;
  let matchedOption = true;
  if (current.type === "DIAGNOSTIC") {
    const resolved = resolveNextFromDiagnostic(asConfig(current.config), opts.result);
    nextId = resolved.nextNodeId;
    matchedOption = resolved.matched;
    const config = asConfig(current.config);
    const hasOptions = (config.options ?? []).length > 0;
    // Legacy: if diagnostic has no options, next sortOrder BRANCH may hold the rules
    if (!nextId && !hasOptions) {
      const after = nodes
        .filter((n) => n.sortOrder > current.sortOrder)
        .sort((a, b) => a.sortOrder - b.sortOrder)[0];
      if (after?.type === "BRANCH") {
        nextId = evaluateBranch(asConfig(after.config), opts.result);
      } else if (after) {
        nextId = after.id;
      }
    }
    if (hasOptions && !matchedOption) {
      return {
        ok: true as const,
        sessionId: session.id,
        step: publicStep(current),
        unmatched: true as const,
        note: `Could not match "${String(opts.result)}" to an option (${(config.options ?? [])
          .map((o) => optionPublicLabel(o))
          .join(" | ")}). Ask a short clarifying question using only those options. Do not invent other tests or leave this step.`,
      };
    }
  } else if (current.type === "BRANCH") {
    nextId = evaluateBranch(asConfig(current.config), opts.result);
  }

  const landed = skipPastBranches(nodes, nextId, opts.result);
  const next = landed?.node ?? (nextId ? nodes.find((n) => n.id === nextId) : null);

  if (!next || next.type === "BRANCH") {
    await prisma.techAssistSession.update({
      where: { id: session.id },
      data: {
        status: TechAssistSessionStatus.COMPLETED,
        currentNodeId: current.id,
        history: history as Prisma.InputJsonValue,
      },
    });
    return {
      ok: true as const,
      sessionId: session.id,
      step: {
        type: "RESOLUTION" as const,
        title: "End of workflow",
        instructions:
          "No further step is configured for this result. Stop here unless the technician describes a different problem.",
        done: true,
      },
    };
  }

  const done = next.type === "RESOLUTION";
  await prisma.techAssistSession.update({
    where: { id: session.id },
    data: {
      currentNodeId: next.id,
      status: done ? TechAssistSessionStatus.COMPLETED : TechAssistSessionStatus.ACTIVE,
      history: history as Prisma.InputJsonValue,
    },
  });

  return {
    ok: true as const,
    sessionId: session.id,
    issueName: session.issue.name,
    step: publicStep(next),
    note: done
      ? "This is the resolution. Do not continue the tree."
      : "Ask only for this step's result. Share tips if helpful. Do not preview later diagnostics.",
  };
}
