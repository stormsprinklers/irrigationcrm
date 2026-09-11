import { addCampaignWaitDays } from "@/lib/marketing/campaign-time";
import { delayMs, matchingReplyKeyword, type WaitDurationUnit } from "@/lib/marketing/wait-config";

export const IF_ELSE_FIELDS = [
  { id: "smsReply", label: "SMS reply" },
  { id: "name", label: "Name" },
  { id: "city", label: "City" },
  { id: "company", label: "Company" },
  { id: "lastAppointmentAt", label: "Last Appointment At" },
  { id: "tags", label: "Tags" },
  { id: "ltv", label: "LTV" },
  { id: "leadSource", label: "Lead Source" },
] as const;

export type IfElseField = (typeof IF_ELSE_FIELDS)[number]["id"];

export const IF_ELSE_OPERATORS = [
  { id: "is", label: "Is" },
  { id: "is_not", label: "Is Not" },
  { id: "contains", label: "Contains" },
  { id: "does_not_contain", label: "Does not Contain" },
  { id: "is_any_of", label: "Is any of (comma separated)" },
  { id: "is_not_any_of", label: "Is not any of (comma separated)" },
  { id: "is_empty", label: "Is empty" },
  { id: "is_not_empty", label: "Is not empty" },
  { id: "lt", label: "Is Less Than" },
  { id: "gt", label: "Is Greater Than" },
] as const;

export type IfElseOperator = (typeof IF_ELSE_OPERATORS)[number]["id"];

export type IfElseCondition = {
  id: string;
  field: IfElseField;
  operator: IfElseOperator;
  value: string;
};

export type IfElseBooleanOp = "AND" | "OR";

export type IfElseSegment = {
  id: string;
  /** How conditions inside this segment combine. */
  booleanOp: IfElseBooleanOp;
  /** How this segment combines with the previous one. Ignored on the first segment. */
  joinOp: IfElseBooleanOp;
  conditions: IfElseCondition[];
};

export type IfElseBranch = {
  id: string;
  segments: IfElseSegment[];
  nextId: string;
};

export type IfElseConfig = {
  kind: "if_else";
  branches: IfElseBranch[];
  noneNextId: string;
  /** When true, unmatched contacts wait, then take timeoutNextId. */
  timeoutEnabled: boolean;
  timeoutAmount: number;
  timeoutUnit: WaitDurationUnit;
  timeoutNextId: string;
};

export const IF_ELSE_MAX_BRANCHES = 8;

export type IfElseContact = {
  name: string;
  city: string;
  /** Customer city plus property cities. */
  cities?: string[];
  companyName: string;
  tags: string[];
  leadSource: string;
  ltv: number;
  lastAppointmentAt: Date | null;
  /** Latest inbound SMS/email body while waiting on this step. */
  smsReply?: string;
};

export function newIfElseId() {
  return `br-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function operatorNeedsValue(operator: IfElseOperator) {
  return operator !== "is_empty" && operator !== "is_not_empty";
}

export function emptyIfElseCondition(): IfElseCondition {
  return { id: newIfElseId(), field: "city", operator: "is", value: "" };
}

function asBooleanOp(value: unknown): IfElseBooleanOp {
  return value === "OR" ? "OR" : "AND";
}

export function emptyIfElseSegment(joinOp: IfElseBooleanOp = "AND"): IfElseSegment {
  return {
    id: newIfElseId(),
    booleanOp: "AND",
    joinOp,
    conditions: [emptyIfElseCondition()],
  };
}

export function emptyIfElseBranch(): IfElseBranch {
  return {
    id: newIfElseId(),
    segments: [emptyIfElseSegment()],
    nextId: "",
  };
}

export function defaultIfElseConfig(): IfElseConfig {
  return {
    kind: "if_else",
    branches: [emptyIfElseBranch()],
    noneNextId: "",
    timeoutEnabled: false,
    timeoutAmount: 2,
    timeoutUnit: "days",
    timeoutNextId: "",
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function usesIfElseConfig(config: unknown): boolean {
  const rec = asRecord(config);
  return rec.kind === "if_else" || Array.isArray(rec.branches);
}

export function isLegacyReactionBranch(config: unknown): boolean {
  const rec = asRecord(config);
  return !usesIfElseConfig(rec) && typeof rec.metric === "string";
}

function asField(value: unknown): IfElseField {
  return IF_ELSE_FIELDS.some((f) => f.id === value) ? (value as IfElseField) : "city";
}

function asOperator(value: unknown): IfElseOperator {
  return IF_ELSE_OPERATORS.some((o) => o.id === value)
    ? (value as IfElseOperator)
    : "is";
}

function parseCondition(raw: unknown): IfElseCondition {
  const cond = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    id: typeof cond.id === "string" && cond.id ? cond.id : newIfElseId(),
    field: asField(cond.field),
    operator: asOperator(cond.operator),
    value: typeof cond.value === "string" ? cond.value : String(cond.value ?? ""),
  };
}

function parseSegment(raw: unknown): IfElseSegment {
  const item = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const conditionsRaw = Array.isArray(item.conditions) ? item.conditions : [];
  return {
    id: typeof item.id === "string" && item.id ? item.id : newIfElseId(),
    booleanOp: asBooleanOp(item.booleanOp),
    joinOp: asBooleanOp(item.joinOp),
    conditions: (conditionsRaw.length ? conditionsRaw : [{}]).map(parseCondition),
  };
}

function parseBranch(raw: unknown): IfElseBranch {
  const item = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  let segments: IfElseSegment[];
  if (Array.isArray(item.segments) && item.segments.length > 0) {
    segments = item.segments.map(parseSegment);
  } else {
    const conditionsRaw = Array.isArray(item.conditions) ? item.conditions : [{}];
    segments = [
      {
        id: newIfElseId(),
        booleanOp: asBooleanOp(item.booleanOp),
        joinOp: "AND",
        conditions: conditionsRaw.map(parseCondition),
      },
    ];
  }
  return {
    id: typeof item.id === "string" && item.id ? item.id : newIfElseId(),
    segments,
    nextId: typeof item.nextId === "string" ? item.nextId : "",
  };
}

export function parseIfElseConfig(raw: unknown): IfElseConfig {
  const config = asRecord(raw);
  const timeoutUnit =
    config.timeoutUnit === "minutes" || config.timeoutUnit === "hours" || config.timeoutUnit === "days"
      ? config.timeoutUnit
      : "days";
  const timeoutAmountRaw = Number(config.timeoutAmount);
  const timeoutAmount =
    Number.isFinite(timeoutAmountRaw) && timeoutAmountRaw >= 0 ? timeoutAmountRaw : 2;

  if (usesIfElseConfig(config)) {
    const rawBranches = Array.isArray(config.branches) ? config.branches : [];
    const branches = rawBranches.slice(0, IF_ELSE_MAX_BRANCHES).map(parseBranch);
    return {
      kind: "if_else",
      branches,
      noneNextId: typeof config.noneNextId === "string" ? config.noneNextId : "",
      timeoutEnabled: Boolean(config.timeoutEnabled),
      timeoutAmount,
      timeoutUnit,
      timeoutNextId: typeof config.timeoutNextId === "string" ? config.timeoutNextId : "",
    };
  }

  return {
    kind: "if_else",
    branches: [emptyIfElseBranch()],
    noneNextId: typeof config.noNextId === "string" ? config.noNextId : "",
    timeoutEnabled: Boolean(config.timeoutEnabled),
    timeoutAmount,
    timeoutUnit,
    timeoutNextId: typeof config.timeoutNextId === "string" ? config.timeoutNextId : "",
  };
}

export function ifElseWaitsForSmsReply(config: IfElseConfig): boolean {
  return config.branches.some((branch) =>
    branch.segments.some((segment) =>
      segment.conditions.some((condition) => condition.field === "smsReply")
    )
  );
}

export function ifElseTimeoutAt(
  config: IfElseConfig,
  from = new Date(),
  timeZone?: string | null
): Date | null {
  if (!config.timeoutEnabled) return null;
  if (config.timeoutUnit === "days") {
    return addCampaignWaitDays(from, config.timeoutAmount, timeZone);
  }
  return new Date(from.getTime() + delayMs(config.timeoutAmount, config.timeoutUnit));
}

export function remapFlowNextIds(
  config: Record<string, unknown>,
  idMap: Map<string, string>
): Record<string, unknown> {
  const mapId = (value: unknown) => {
    if (typeof value !== "string" || !value) return typeof value === "string" ? value : value;
    return idMap.get(value) ?? value;
  };
  const next = { ...config };
  next.yesNextId = mapId(next.yesNextId);
  next.noNextId = mapId(next.noNextId);
  next.noneNextId = mapId(next.noneNextId);
  next.timeoutNextId = mapId(next.timeoutNextId);
  if (Array.isArray(next.branches)) {
    next.branches = next.branches.map((row) => {
      const branch = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
      return { ...branch, nextId: mapId(branch.nextId) };
    });
  }
  return next;
}

export function scrubIfElseNextIds(
  config: Record<string, unknown>,
  removedId: string
): Record<string, unknown> {
  const next = { ...config };
  if (next.yesNextId === removedId) next.yesNextId = "";
  if (next.noNextId === removedId) next.noNextId = "";
  if (next.noneNextId === removedId) next.noneNextId = "";
  if (next.timeoutNextId === removedId) next.timeoutNextId = "";
  if (Array.isArray(next.branches)) {
    next.branches = next.branches.map((row) => {
      const branch = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
      return {
        ...branch,
        nextId: branch.nextId === removedId ? "" : branch.nextId,
      };
    });
  }
  return next;
}

function norm(value: string) {
  return value.trim().toLowerCase();
}

function splitList(value: string) {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseNumber(value: string): number | null {
  const n = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function cityValues(contact: IfElseContact): string[] {
  if (contact.cities && contact.cities.length > 0) {
    return contact.cities.filter(Boolean);
  }
  return contact.city ? [contact.city] : [];
}

function fieldText(contact: IfElseContact, field: IfElseField): string {
  switch (field) {
    case "smsReply":
      return contact.smsReply ?? "";
    case "name":
      return contact.name;
    case "city":
      return cityValues(contact).join(", ");
    case "company":
      return contact.companyName;
    case "leadSource":
      return contact.leadSource;
    case "tags":
      return contact.tags.join(", ");
    case "ltv":
      return String(contact.ltv);
    case "lastAppointmentAt":
      return contact.lastAppointmentAt?.toISOString() ?? "";
  }
}

function isEmptyField(contact: IfElseContact, field: IfElseField): boolean {
  if (field === "tags") return contact.tags.length === 0;
  if (field === "city") return cityValues(contact).length === 0;
  if (field === "ltv") return contact.ltv === 0;
  if (field === "lastAppointmentAt") return !contact.lastAppointmentAt;
  return !norm(fieldText(contact, field));
}

function matchList(actuals: string[], op: IfElseOperator, raw: string): boolean | null {
  const tags = actuals.map(norm);
  const wanted = splitList(raw).map(norm);
  if (op === "is" || op === "is_any_of") return wanted.some((item) => tags.includes(item));
  if (op === "is_not" || op === "is_not_any_of") return wanted.every((item) => !tags.includes(item));
  if (op === "contains") return tags.some((tag) => tag.includes(norm(raw)));
  if (op === "does_not_contain") return tags.every((tag) => !tag.includes(norm(raw)));
  return null;
}

function evaluateSmsReply(contact: IfElseContact, condition: IfElseCondition): boolean {
  if (contact.smsReply == null) return false;
  const reply = contact.smsReply;
  const op = condition.operator;
  if (!reply.trim()) {
    return op === "is_empty";
  }
  if (op === "is_empty") return false;
  if (op === "is_not_empty") return true;
  if (op === "is" || op === "is_any_of") {
    const keywords = op === "is_any_of" ? splitList(condition.value) : [condition.value];
    return matchingReplyKeyword(reply, keywords.map(norm).filter(Boolean)) != null;
  }
  if (op === "is_not" || op === "is_not_any_of") {
    const keywords = op === "is_not_any_of" ? splitList(condition.value) : [condition.value];
    return matchingReplyKeyword(reply, keywords.map(norm).filter(Boolean)) == null;
  }
  if (op === "contains") return norm(reply).includes(norm(condition.value));
  if (op === "does_not_contain") return !norm(reply).includes(norm(condition.value));
  return false;
}

function evaluateCondition(contact: IfElseContact, condition: IfElseCondition): boolean {
  if (condition.field === "smsReply") {
    return evaluateSmsReply(contact, condition);
  }
  const op = condition.operator;
  const raw = condition.value;
  if (op === "is_empty") return isEmptyField(contact, condition.field);
  if (op === "is_not_empty") return !isEmptyField(contact, condition.field);

  if (condition.field === "ltv" && (op === "lt" || op === "gt" || op === "is" || op === "is_not")) {
    const target = parseNumber(raw);
    if (target == null) return false;
    if (op === "lt") return contact.ltv < target;
    if (op === "gt") return contact.ltv > target;
    if (op === "is") return contact.ltv === target;
    return contact.ltv !== target;
  }

  if (condition.field === "lastAppointmentAt") {
    const actual = contact.lastAppointmentAt;
    if (op === "lt" || op === "gt" || op === "is" || op === "is_not") {
      const target = parseDate(raw);
      if (!actual || !target) return false;
      if (op === "lt") return actual.getTime() < target.getTime();
      if (op === "gt") return actual.getTime() > target.getTime();
      if (op === "is") return actual.toISOString().slice(0, 10) === target.toISOString().slice(0, 10);
      return actual.toISOString().slice(0, 10) !== target.toISOString().slice(0, 10);
    }
  }

  if (condition.field === "tags") {
    const matched = matchList(contact.tags, op, raw);
    if (matched != null) return matched;
    if (op === "lt" || op === "gt") return false;
  }

  if (condition.field === "city") {
    const matched = matchList(cityValues(contact), op, raw);
    if (matched != null) return matched;
  }

  const actual = norm(fieldText(contact, condition.field));
  const expected = norm(raw);
  const list = splitList(raw).map(norm);

  if (op === "is") return actual === expected;
  if (op === "is_not") return actual !== expected;
  if (op === "contains") return actual.includes(expected);
  if (op === "does_not_contain") return !actual.includes(expected);
  if (op === "is_any_of") return list.includes(actual);
  if (op === "is_not_any_of") return !list.includes(actual);
  if (op === "lt" || op === "gt") {
    const left = parseNumber(actual);
    const right = parseNumber(raw);
    if (left == null || right == null) return false;
    return op === "lt" ? left < right : left > right;
  }
  return false;
}

function segmentMatches(contact: IfElseContact, segment: IfElseSegment): boolean {
  const results = segment.conditions.map((condition) => evaluateCondition(contact, condition));
  if (results.length === 0) return false;
  return segment.booleanOp === "OR" ? results.some(Boolean) : results.every(Boolean);
}

export function branchMatches(contact: IfElseContact, branch: IfElseBranch): boolean {
  if (branch.segments.length === 0) return false;
  return branch.segments.reduce((matched, segment, index) => {
    const next = segmentMatches(contact, segment);
    if (index === 0) return next;
    return asBooleanOp(segment.joinOp) === "OR" ? matched || next : matched && next;
  }, false);
}

export function pickIfElseNextId(contact: IfElseContact, config: IfElseConfig): string {
  for (const branch of config.branches) {
    if (branchMatches(contact, branch)) return branch.nextId;
  }
  return config.noneNextId;
}

export function ifElseNeedsWait(config: IfElseConfig): boolean {
  // SMS replies already received (or a prior Wait step) are evaluated immediately.
  // Only a legacy timeout path holds the contact on this node.
  return config.timeoutEnabled;
}

export type IfElseResolvePhase = "immediate" | "reply" | "timeout";

export type IfElseResolveResult = {
  reason: "match" | "none" | "timeout";
  nextId: string;
  branchId: string;
};

/** First matching branch wins. Timeout is only used when the wait expires unmatched. */
export function resolveIfElseBranch(
  contact: IfElseContact | null,
  config: IfElseConfig,
  phase: IfElseResolvePhase
): IfElseResolveResult {
  const matched = contact
    ? config.branches.find((branch) => branchMatches(contact, branch))
    : undefined;
  if (matched) {
    return { reason: "match", nextId: matched.nextId, branchId: matched.id };
  }
  if (phase === "timeout") {
    return { reason: "timeout", nextId: config.timeoutNextId, branchId: "timeout" };
  }
  return { reason: "none", nextId: config.noneNextId, branchId: "none" };
}

function operatorLabel(id: IfElseOperator) {
  return IF_ELSE_OPERATORS.find((o) => o.id === id)?.label ?? id;
}

function fieldLabel(id: IfElseField) {
  return IF_ELSE_FIELDS.find((f) => f.id === id)?.label ?? id;
}

export function ifElseSummary(config: unknown): string {
  if (isLegacyReactionBranch(config)) {
    return "If/Else · convert this step to conditions";
  }
  const parsed = parseIfElseConfig(config);
  const count = parsed.branches.length;
  const sms = ifElseWaitsForSmsReply(parsed) ? " · SMS reply" : "";
  const timeout = parsed.timeoutEnabled ? " + Timeout" : "";
  return `If/Else · ${count} branch${count === 1 ? "" : "es"} + None${timeout}${sms}`;
}

export function conditionPreview(condition: IfElseCondition): string {
  const field = fieldLabel(condition.field);
  const op = operatorLabel(condition.operator);
  if (!operatorNeedsValue(condition.operator)) return `${field} ${op}`;
  return `${field} ${op} ${condition.value || "…"}`;
}

export function branchPreview(branch: IfElseBranch): string {
  const parts = branch.segments.map((segment, segmentIndex) => {
    const inner = segment.conditions
      .map((condition, index) => {
        const prefix = index === 0 ? "" : ` ${segment.booleanOp} `;
        return `${prefix}${conditionPreview(condition)}`;
      })
      .join("");
    const wrapped = segment.conditions.length > 1 ? `(${inner})` : inner;
    const join = segmentIndex === 0 ? "" : ` ${asBooleanOp(segment.joinOp)} `;
    return `${join}${wrapped}`;
  });
  return parts.join("").trim() || "No conditions";
}
