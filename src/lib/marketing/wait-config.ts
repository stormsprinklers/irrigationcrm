import { addCampaignWaitDays, parseCampaignInstant } from "@/lib/marketing/campaign-time";
import { formatInTimezone, resolveCompanyTimezone } from "@/lib/datetime/zoned";

export const WAIT_DURATION_UNITS = ["minutes", "hours", "days"] as const;
export type WaitDurationUnit = (typeof WAIT_DURATION_UNITS)[number];

export const WAIT_MODES = ["delay", "date", "reply", "action", "delay_or_reply"] as const;
export type WaitMode = (typeof WAIT_MODES)[number];

export const WAIT_ACTIONS = ["clicked"] as const;
export type WaitAction = (typeof WAIT_ACTIONS)[number];

export type ParsedWaitConfig = {
  mode: WaitMode;
  delayAmount: number;
  delayUnit: WaitDurationUnit;
  sendAt: Date | null;
  sendAtRaw: string | null;
  keywords: string[];
  replyChannel: "any" | "sms";
  action: WaitAction;
  usesReply: boolean;
  usesAction: boolean;
  timeoutEnabled: boolean;
  hasTimeout: boolean;
};

const UNIT_MS: Record<WaitDurationUnit, number> = {
  minutes: 60 * 1000,
  hours: 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
};

export const REPLY_POLL_MS = 15 * 60 * 1000;

function asUnit(value: unknown): WaitDurationUnit {
  if (value === "minutes" || value === "days" || value === "hours") return value;
  return "hours";
}

function asMode(value: unknown): WaitMode {
  if (
    value === "date" ||
    value === "reply" ||
    value === "action" ||
    value === "delay_or_reply" ||
    value === "delay"
  ) {
    return value;
  }
  return "delay";
}

function asAction(_value: unknown): WaitAction {
  return "clicked";
}

export function parseReplyKeywords(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split(/[,|\n]+/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

function asRecord(value: unknown): Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function parseWaitConfig(raw: unknown): ParsedWaitConfig {
  const config = asRecord(raw);
  const mode = asMode(config.mode);
  let delayUnit = asUnit(config.delayUnit);
  let delayAmount = Number(config.delayAmount);
  if (!Number.isFinite(delayAmount) || delayAmount < 0) {
    const legacyHours = Number(config.delayHours);
    if (Number.isFinite(legacyHours) && legacyHours > 0) {
      delayAmount = legacyHours;
      delayUnit = "hours";
    } else {
      delayAmount = mode === "delay" || mode === "delay_or_reply" ? 1 : 0;
      if (!config.delayUnit && delayAmount === 1) delayUnit = mode === "delay" ? "days" : delayUnit;
    }
  }
  if (
    (mode === "reply" || mode === "action") &&
    Boolean(config.timeoutEnabled) &&
    delayAmount === 0
  ) {
    delayAmount = 2;
    if (!config.delayUnit) delayUnit = "days";
  }

  const sendAtRaw =
    mode === "date" && typeof config.sendAt === "string" && config.sendAt.trim()
      ? config.sendAt.trim()
      : null;
  const sendAt = parseCampaignInstant(sendAtRaw);

  const keywords = parseReplyKeywords(config.replyKeyword);
  const replyChannel = config.replyChannel === "sms" ? "sms" : "any";
  const action = asAction(config.action);
  const usesReply = mode === "reply" || mode === "delay_or_reply";
  const usesAction = mode === "action";
  const timeoutEnabled =
    mode === "delay_or_reply" ||
    ((mode === "reply" || mode === "action") && Boolean(config.timeoutEnabled));
  const hasTimeout =
    mode === "delay" || mode === "date" || mode === "delay_or_reply" || timeoutEnabled;

  return {
    mode,
    delayAmount,
    delayUnit,
    sendAt: sendAt && !Number.isNaN(sendAt.getTime()) ? sendAt : null,
    sendAtRaw,
    keywords,
    replyChannel,
    action,
    usesReply,
    usesAction,
    timeoutEnabled,
    hasTimeout,
  };
}

export function delayMs(amount: number, unit: WaitDurationUnit): number {
  return Math.max(0, amount) * UNIT_MS[unit];
}

export function waitTimeoutAt(
  wait: ParsedWaitConfig,
  from = new Date(),
  timeZone?: string | null
): Date | null {
  if (wait.mode === "date") {
    return parseCampaignInstant(wait.sendAtRaw, timeZone) ?? wait.sendAt;
  }
  if (
    wait.mode === "delay" ||
    wait.mode === "delay_or_reply" ||
    ((wait.mode === "reply" || wait.mode === "action") && wait.timeoutEnabled)
  ) {
    if (wait.delayUnit === "days") {
      return addCampaignWaitDays(from, wait.delayAmount, timeZone);
    }
    return new Date(from.getTime() + delayMs(wait.delayAmount, wait.delayUnit));
  }
  return null;
}

/** Next time the flow processor should re-check a wait (timeout, or reply/action poll). */
export function nextWaitCheckAt(
  wait: ParsedWaitConfig,
  timeoutAt: Date | null,
  from = new Date()
): Date {
  if (wait.usesReply || wait.usesAction) {
    const poll = new Date(from.getTime() + REPLY_POLL_MS);
    if (timeoutAt && timeoutAt.getTime() < poll.getTime()) return timeoutAt;
    return poll;
  }
  return timeoutAt ?? from;
}

export function matchingReplyKeyword(text: string, keywords: string[]): string | null {
  const hay = text.trim();
  if (!hay) return null;
  if (keywords.length === 0) return hay.slice(0, 40);

  const lower = hay.toLowerCase();
  for (const keyword of keywords) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
    if (pattern.test(lower)) return keyword;
  }
  return null;
}

export function recipientMatchesWaitAction(
  recipient: { openedAt?: Date | null; clickedAt?: Date | null; clickCount?: number } | null,
  _action: WaitAction
): boolean {
  if (!recipient) return false;
  return Boolean(recipient.clickedAt || (recipient.clickCount ?? 0) > 0);
}

export function waitActionLabel(_action: WaitAction): string {
  return "they click a link";
}

export function waitSummary(config: unknown, timeZone?: string | null): string {
  const wait = parseWaitConfig(config);
  const durationLabel = `${wait.delayAmount} ${wait.delayUnit}`;
  const keywordLabel =
    wait.keywords.length > 0
      ? `reply containing “${wait.keywords.join(", ")}”`
      : wait.replyChannel === "sms" ? "any SMS reply" : "any customer reply";

  if (wait.mode === "date") {
    if (!wait.sendAtRaw && !wait.sendAt) return "Until a specific date/time";
    const tz = resolveCompanyTimezone(timeZone);
    const at = parseCampaignInstant(wait.sendAtRaw, tz) ?? wait.sendAt;
    return at
      ? `Until ${formatInTimezone(at, tz, {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}`
      : "Until a specific date/time";
  }
  if (wait.mode === "reply") {
    if (wait.timeoutEnabled) return `Until ${keywordLabel} or ${durationLabel}`;
    return `Until ${keywordLabel}`;
  }
  if (wait.mode === "action") {
    if (wait.timeoutEnabled) return `Until ${waitActionLabel(wait.action)} or ${durationLabel}`;
    return `Until ${waitActionLabel(wait.action)}`;
  }
  if (wait.mode === "delay_or_reply") {
    return `Until ${durationLabel} or ${keywordLabel}`;
  }
  return `Wait ${durationLabel}`;
}

export function parseBranchWaitMs(config: Record<string, unknown>): number {
  const amount = Number(config.waitAmount);
  if (Number.isFinite(amount) && amount >= 0 && config.waitUnit) {
    return delayMs(amount, asUnit(config.waitUnit));
  }
  const hours = Number(config.waitHours);
  if (Number.isFinite(hours) && hours > 0) return delayMs(hours, "hours");
  return delayMs(48, "hours");
}
