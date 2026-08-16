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

export type TechAssistOption = {
  id: string;
  label: string;
  match?: TechAssistOptionMatch;
  value?: number | string;
  min?: number;
  max?: number;
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
  if (!text || Number.isNaN(Number(text))) return null;
  return Number(text);
}

function optionMatches(option: TechAssistOption, result: unknown): boolean {
  const match = option.match ?? "label";
  const text = normalizeResultText(result);
  const num = resultNumber(result);
  const label = option.label.trim().toLowerCase();

  if (match === "yes") {
    return ["yes", "y", "true", "1"].includes(text) || text === label;
  }
  if (match === "no") {
    return ["no", "n", "false", "0"].includes(text) || text === label;
  }
  if (match === "lt" && num != null && option.value != null) return num < Number(option.value);
  if (match === "gt" && num != null && option.value != null) return num > Number(option.value);
  if (match === "lte" && num != null && option.value != null) return num <= Number(option.value);
  if (match === "gte" && num != null && option.value != null) return num >= Number(option.value);
  if (match === "between" && num != null && option.min != null && option.max != null) {
    return num >= option.min && num <= option.max;
  }
  if (match === "eq") {
    if (num != null && option.value != null && typeof option.value !== "string") {
      return num === Number(option.value);
    }
    return text === String(option.value ?? label).toLowerCase();
  }
  // label / free-text: match option label or contained phrase
  if (!label) return false;
  return text === label || text.includes(label) || label.includes(text);
}

/** Resolve next node from a diagnostic's options (new model) or legacy BRANCH rules. */
export function resolveNextFromDiagnostic(
  config: TechAssistNodeConfig,
  result: unknown
): string | null {
  const options = config.options ?? [];
  if (options.length > 0) {
    for (const option of options) {
      if (optionMatches(option, result) && option.nextNodeId) {
        return option.nextNodeId;
      }
    }
    return config.defaultNextNodeId ?? null;
  }
  return evaluateBranch(config, result);
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
      label: option.label,
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
  if (current.type === "DIAGNOSTIC") {
    nextId = resolveNextFromDiagnostic(asConfig(current.config), opts.result);
    // Legacy: if diagnostic has no options, next sortOrder BRANCH may hold the rules
    if (!nextId) {
      const after = nodes
        .filter((n) => n.sortOrder > current.sortOrder)
        .sort((a, b) => a.sortOrder - b.sortOrder)[0];
      if (after?.type === "BRANCH") {
        nextId = evaluateBranch(asConfig(after.config), opts.result);
      } else if (after) {
        nextId = after.id;
      }
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
