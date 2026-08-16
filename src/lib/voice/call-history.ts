import { formatPhoneDisplay } from "@/lib/inbox/phone";

export type CallHistoryListItem = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  status: string;
  durationSec: number | null;
  startedAt: string;
  endedAt: string | null;
  fromNumber: string;
  toNumber: string;
  answered: boolean;
  hasRecording: boolean;
  hasTranscript: boolean;
  hasSummary: boolean;
  hasVoicemail: boolean;
  objectionCategory: string | null;
  objectionReason: string | null;
  /** True when the AI receptionist handled (or started) this call. */
  isAiAgent: boolean;
  /** When set, missed inbound no longer counts toward the CSR Desk badge. */
  missedReviewedAt: string | null;
  customer: { id: string; name: string; phone: string | null } | null;
  employee: { id: string; name: string } | null;
};

/** Max calls returned to CSR desk history UI. All CallLog rows remain stored indefinitely. */
export const CALL_HISTORY_UI_LIMIT = 250;

/** Sidebar CSR Desk badge: inbound missed calls in this window. */
export const MISSED_CALL_LOOKBACK_MS = 2 * 24 * 60 * 60 * 1000;

export function isRecentMissedInboundCall(call: {
  direction: "INBOUND" | "OUTBOUND";
  answered: boolean;
  startedAt: string;
  now?: number;
}) {
  if (call.direction !== "INBOUND" || call.answered) return false;
  const now = call.now ?? Date.now();
  return now - new Date(call.startedAt).getTime() <= MISSED_CALL_LOOKBACK_MS;
}

export function isUnreviewedMissedInboundCall(call: {
  direction: "INBOUND" | "OUTBOUND";
  answered: boolean;
  startedAt: string;
  missedReviewedAt?: string | null;
  now?: number;
}) {
  if (call.missedReviewedAt) return false;
  return isRecentMissedInboundCall(call);
}

/** Scroll after ~20 rows (~3.65rem each). */
export const CALL_HISTORY_LIST_MAX_HEIGHT_CLASS = "max-h-[calc(20*3.65rem)]";

export type CallHistoryDetail = CallHistoryListItem & {
  recordingPlaybackUrl: string | null;
  transcript: string | null;
  aiSummary: string | null;
  visitId: string | null;
  /** Tracking / lead source from the dialed company number (inbound). */
  trackingSource: string | null;
  /** Friendly title of the company PhoneNumber dialed (inbound). */
  inboundLineTitle: string | null;
  /** Company number dialed on inbound (or our caller ID on outbound). */
  inboundLineE164: string | null;
  /** All employees who joined (answer + transfers). */
  participants: Array<{
    id: string;
    name: string;
    role: string;
    phoneE164: string | null;
    joinedAt: string;
  }>;
  /** @deprecated Use employee — kept for older clients */
  handledBy: { id: string; name: string } | null;
};

export function isVoicemailDisposition(dispositionNote: string | null | undefined) {
  return (dispositionNote ?? "").toLowerCase().includes("voicemail");
}

export function isCallAnswered(
  status: string,
  durationSec: number | null | undefined,
  options?: { dispositionNote?: string | null }
): boolean {
  if (isVoicemailDisposition(options?.dispositionNote)) return false;
  const normalized = status.toLowerCase();
  if (["no-answer", "busy", "failed", "canceled", "cancelled"].includes(normalized)) {
    return false;
  }
  if (normalized === "completed") return (durationSec ?? 0) > 0;
  return false;
}

export function isMissedInboundLog(log: {
  status: string;
  durationSec: number | null | undefined;
  dispositionNote?: string | null;
}) {
  return !isCallAnswered(log.status, log.durationSec, {
    dispositionNote: log.dispositionNote,
  });
}

export function formatCallDuration(durationSec: number | null | undefined): string {
  if (durationSec == null || durationSec <= 0) return "—";
  const mins = Math.floor(durationSec / 60);
  const secs = durationSec % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

export function formatCallDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatCallTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function remotePartyNumber(
  direction: "INBOUND" | "OUTBOUND",
  fromNumber: string,
  toNumber: string
): string {
  return direction === "INBOUND" ? fromNumber : toNumber;
}

export function remotePartyLabel(
  direction: "INBOUND" | "OUTBOUND",
  fromNumber: string,
  toNumber: string,
  customerName?: string | null
): string {
  if (customerName) return customerName;
  return formatPhoneDisplay(remotePartyNumber(direction, fromNumber, toNumber));
}
