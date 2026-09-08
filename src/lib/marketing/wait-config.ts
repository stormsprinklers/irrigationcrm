import { addCampaignWaitDays, parseCampaignInstant } from "@/lib/marketing/campaign-time";
import { formatInTimezone, resolveCompanyTimezone } from "@/lib/datetime/zoned";

export const WAIT_DURATION_UNITS = ["minutes", "hours", "days"] as const;
export type WaitDurationUnit = (typeof WAIT_DURATION_UNITS)[number];

export const WAIT_MODES = ["delay", "date", "reply", "action", "delay_or_reply"] as const;
export type WaitMode = (typeof WAIT_MODES)[number];

export const WAIT_ACTIONS = ["opened", "clicked", "opened_or_clicked"] as const;
export type WaitAction = (typeof WAIT_ACTIONS)[number];

export type ParsedWaitConfig = {
  mode: WaitMode;
  delayAmount: number;
  delayUnit: WaitDurationUnit;
  sendAt: Date | null;
  sendAtRaw: string | null;
  keywords: string[];
  action: WaitAction;
  usesReply: boolean;
  usesAction: boolean;
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

function asAction(value: unknown): WaitAction {
  if (value === "clicked" || value === "opened_or_clicked") return value;
  return "opened";
}

export function parseReplyKeywords(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split(/[,|\n]+/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

export function parseWaitConfig(config: Record<string, unknown>): ParsedWaitConfig {
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

  const sendAtRaw =
    mode === "date" && typeof config.sendAt === "string" && config.sendAt.trim()
      ? config.sendAt.trim()
      : null;
  const sendAt = parseCampaignInstant(sendAtRaw);

  const keywords = parseReplyKeywords(config.replyKeyword);
  const action = asAction(config.action);
  const usesReply = mode === "reply" || mode === "delay_or_reply";
  const usesAction = mode === "action";
  const hasTimeout = mode === "delay" || mode === "date" || mode === "delay_or_reply";

  return {
    mode,
    delayAmount,
    delayUnit,
    sendAt: sendAt && !Number.isNaN(sendAt.getTime()) ? sendAt : null,
    sendAtRaw,
    keywords,
    action,
    usesReply,
    usesAction,
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
  if (wait.mode === "delay" || wait.mode === "delay_or_reply") {
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
  action: WaitAction
): boolean {
  if (!recipient) return false;
  const opened = Boolean(recipient.openedAt);
  const clicked = Boolean(recipient.clickedAt || (recipient.clickCount ?? 0) > 0);
  if (action === "opened") return opened;
  if (action === "clicked") return clicked;
  return opened || clicked;
}

export function waitActionLabel(action: WaitAction): string {
  if (action === "clicked") return "they click a link";
  if (action === "opened_or_clicked") return "they open an email or click a link";
  return "they open an email";
}

export function waitSummary(config: Record<string, unknown>, timeZone?: string | null): string {
  const wait = parseWaitConfig(config);
  const durationLabel = `${wait.delayAmount} ${wait.delayUnit}`;
  const keywordLabel =
    wait.keywords.length > 0
      ? `reply containing “${wait.keywords.join(", ")}”`
      : "any customer reply";

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
  if (wait.mode === "reply") return `Until ${keywordLabel}`;
  if (wait.mode === "action") return `Until ${waitActionLabel(wait.action)}`;
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
