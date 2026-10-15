import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export type OutboundChannel = "sms" | "email" | "call";
export type OutboundEnvironmentMode = "normal" | "allowlist" | "disabled";

export const DEFAULT_OUTBOUND_FREEZE_REASON =
  "Outbound communications are temporarily paused by an administrator.";

const CHANNEL_NOUN: Record<OutboundChannel, string> = {
  sms: "Text message",
  email: "Email",
  call: "Phone call",
};

export type OutboundCommsState = {
  disabled: boolean;
  reason: string | null;
  disabledAt: Date | null;
  disabledById: string | null;
};

/**
 * Thrown by the low-level send primitives when a company has an active
 * outbound communications freeze. Carries a user-facing message so API routes
 * can surface exactly why the message/call was blocked.
 */
export class OutboundCommsDisabledError extends Error {
  readonly channel: OutboundChannel;
  readonly reason: string;
  readonly disabledAt: Date | null;

  constructor(channel: OutboundChannel, reason: string, disabledAt: Date | null) {
    super(buildOutboundDisabledMessage(channel, reason));
    this.name = "OutboundCommsDisabledError";
    this.channel = channel;
    this.reason = reason;
    this.disabledAt = disabledAt;
  }
}

function environmentMode(): OutboundEnvironmentMode {
  const value = process.env.OUTBOUND_COMMS_MODE?.trim().toLowerCase();
  if (value === "disabled" || value === "allowlist") return value;
  return "normal";
}

function configuredAllowlist(channel: OutboundChannel): string[] {
  const raw =
    channel === "email"
      ? process.env.OUTBOUND_EMAIL_ALLOWLIST
      : process.env.OUTBOUND_PHONE_ALLOWLIST;
  return (raw ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeRecipient(channel: OutboundChannel, recipient: string) {
  if (channel === "email") return recipient.trim().toLowerCase();
  const digits = recipient.replace(/\D/g, "");
  return digits.length === 10 ? `1${digits}` : digits;
}

export function isEnvironmentRecipientAllowed(
  channel: OutboundChannel,
  recipient: string
): boolean {
  const mode = environmentMode();
  if (mode === "normal") return true;
  if (mode === "disabled") return false;
  const normalized = normalizeRecipient(channel, recipient);
  return configuredAllowlist(channel).some(
    (allowed) => normalizeRecipient(channel, allowed) === normalized
  );
}

/**
 * Environment-wide safety gate. Unlike the per-company freeze, diagnostic and
 * MFA sends cannot bypass this control, making it suitable for staging tests.
 */
export function assertEnvironmentRecipientAllowed(
  channel: OutboundChannel,
  recipients: string | string[]
) {
  const values = Array.isArray(recipients) ? recipients : [recipients];
  if (values.every((recipient) => isEnvironmentRecipientAllowed(channel, recipient))) return;
  throw new Error(`${CHANNEL_NOUN[channel]} blocked by the environment outbound safety policy.`);
}

export function buildOutboundDisabledMessage(
  channel: OutboundChannel,
  reason: string | null | undefined
): string {
  const noun = CHANNEL_NOUN[channel];
  const detail = reason?.trim() || DEFAULT_OUTBOUND_FREEZE_REASON;
  return `${noun} was not sent. Outbound communications are currently disabled for your company. ${detail}`;
}

export async function getOutboundCommsState(companyId: string): Promise<OutboundCommsState> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      outboundCommsDisabled: true,
      outboundCommsDisabledReason: true,
      outboundCommsDisabledAt: true,
      outboundCommsDisabledById: true,
    },
  });

  return {
    disabled: Boolean(company?.outboundCommsDisabled),
    reason: company?.outboundCommsDisabledReason ?? null,
    disabledAt: company?.outboundCommsDisabledAt ?? null,
    disabledById: company?.outboundCommsDisabledById ?? null,
  };
}

/**
 * Throws {@link OutboundCommsDisabledError} when the company has an active
 * outbound freeze. Call this at every outbound send site (text/email/call).
 */
export async function assertOutboundCommsEnabled(
  companyId: string,
  channel: OutboundChannel
): Promise<void> {
  const state = await getOutboundCommsState(companyId);
  if (state.disabled) {
    throw new OutboundCommsDisabledError(
      channel,
      state.reason ?? DEFAULT_OUTBOUND_FREEZE_REASON,
      state.disabledAt
    );
  }
}

/**
 * If `error` is an {@link OutboundCommsDisabledError}, returns a 403 JSON
 * response explaining the freeze; otherwise returns null so callers can fall
 * back to their normal error handling.
 */
export function outboundCommsErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof OutboundCommsDisabledError) {
    return NextResponse.json(
      {
        error: error.message,
        code: "OUTBOUND_COMMS_DISABLED",
        channel: error.channel,
      },
      { status: 403 }
    );
  }
  return null;
}
