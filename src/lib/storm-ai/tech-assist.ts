import { TechAssistNodeType, TechAssistSessionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type DiagnosticInputType = "number" | "yes_no" | "choice" | "text";

export type TechAssistNodeConfig = {
  inputType?: DiagnosticInputType;
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
  defaultNextNodeId?: string | null;
};

function asConfig(raw: unknown): TechAssistNodeConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as TechAssistNodeConfig;
}

function keywordsOf(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v).trim().toLowerCase()).filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw
      .split(/[,;]+/)
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
  }
  return [];
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
    return {
      nodeId: node.id,
      type: "DIAGNOSTIC" as const,
      title: node.title,
      instructions: node.body || config.prompt || "",
      inputType: config.inputType ?? "text",
      unit: config.unit ?? null,
      choices: config.choices ?? null,
      done: false,
    };
  }
  return {
    nodeId: node.id,
    type: "BRANCH" as const,
    title: node.title,
    instructions: node.body || "Report the previous test result to continue.",
    done: false,
  };
}

function firstContentNode(
  nodes: Array<{ id: string; type: TechAssistNodeType; sortOrder: number }>,
  entryNodeId: string | null
) {
  if (entryNodeId) {
    const entry = nodes.find((n) => n.id === entryNodeId);
    if (entry) return entry;
  }
  return [...nodes].sort((a, b) => a.sortOrder - b.sortOrder)[0] ?? null;
}

function skipToAskable(
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

export function evaluateBranch(config: TechAssistNodeConfig, result: unknown): string | null {
  const rules = config.rules ?? [];
  const num =
    typeof result === "number"
      ? result
      : typeof result === "string" && result.trim() !== "" && !Number.isNaN(Number(result))
        ? Number(result)
        : null;
  const text = String(result ?? "")
    .trim()
    .toLowerCase();

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

export async function matchTechIssues(companyId: string, query: string) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const issues = await prisma.techAssistIssue.findMany({
    where: { companyId, active: true },
    select: {
      id: true,
      name: true,
      trigger: true,
      description: true,
      keywords: true,
    },
    orderBy: { sortOrder: "asc" },
    take: 80,
  });

  const scored = issues
    .map((issue) => {
      const hay = [
        issue.name,
        issue.trigger,
        issue.description ?? "",
        ...keywordsOf(issue.keywords),
      ]
        .join(" ")
        .toLowerCase();
      let score = 0;
      const tokens = q.split(/\s+/).filter((t) => t.length > 2);
      for (const token of tokens) {
        if (hay.includes(token)) score += 2;
      }
      if (hay.includes(q)) score += 5;
      if (issue.trigger.toLowerCase().includes(q) || q.includes(issue.trigger.toLowerCase())) {
        score += 4;
      }
      return { issue, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return scored.map(({ issue }) => ({
    id: issue.id,
    name: issue.name,
    trigger: issue.trigger,
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

  const start = skipToAskable(issue.nodes, issue.entryNodeId, null);
  const first = start?.node ?? firstContentNode(issue.nodes, issue.entryNodeId);
  if (!first) return { ok: false as const, error: "This workflow has no steps yet" };

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
      history: [],
    },
  });

  return {
    ok: true as const,
    sessionId: session.id,
    issueName: issue.name,
    step: publicStep(first),
    note: "Ask the technician to complete only this step. Do not mention later tests or the rest of the workflow.",
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
  if (current.type === "BRANCH") {
    nextId = evaluateBranch(asConfig(current.config), opts.result);
  } else {
    const after = nodes
      .filter((n) => n.sortOrder > current.sortOrder)
      .sort((a, b) => a.sortOrder - b.sortOrder)[0];
    if (after?.type === "BRANCH") {
      nextId = evaluateBranch(asConfig(after.config), opts.result);
    } else {
      nextId = after?.id ?? null;
    }
  }

  const landed = skipToAskable(nodes, nextId, opts.result);
  const next = landed?.node ?? (nextId ? nodes.find((n) => n.id === nextId) : null);

  if (!next) {
    await prisma.techAssistSession.update({
      where: { id: session.id },
      data: {
        status: TechAssistSessionStatus.COMPLETED,
        currentNodeId: current.id,
        history,
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
      history,
    },
  });

  return {
    ok: true as const,
    sessionId: session.id,
    issueName: session.issue.name,
    step: publicStep(next),
    note: done
      ? "This is the resolution. Do not continue the tree."
      : "Ask only for this step's result. Do not preview later diagnostics.",
  };
}
