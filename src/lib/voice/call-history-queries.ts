import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  type CallHistoryDetail,
  type CallHistoryListItem,
  CALL_HISTORY_UI_LIMIT,
  isCallAnswered,
} from "@/lib/voice/call-history";
import { callRecordingPlaybackPath } from "@/lib/voice/recording";

const callLogInclude = {
  customer: { select: { id: true, name: true, phone: true } },
  user: { select: { id: true, name: true } },
  handledBy: { select: { id: true, name: true } },
  session: {
    select: {
      assignedUser: { select: { id: true, name: true } },
      participants: {
        orderBy: { joinedAt: "asc" as const },
        select: {
          id: true,
          role: true,
          displayName: true,
          phoneE164: true,
          joinedAt: true,
          user: { select: { id: true, name: true } },
        },
      },
    },
  },
  participants: {
    orderBy: { joinedAt: "asc" as const },
    select: {
      id: true,
      role: true,
      displayName: true,
      phoneE164: true,
      joinedAt: true,
      user: { select: { id: true, name: true } },
    },
  },
  conversion: {
    select: {
      answeredBy: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.CallLogInclude;

type CallLogRow = Prisma.CallLogGetPayload<{ include: typeof callLogInclude }>;

const STAFF_ROLES = ["ANSWERED", "AGENT_TRANSFER", "EXTERNAL_TRANSFER"] as const;
const AI_AGENT = { id: "ai-agent", name: "AI Agent" } as const;

function mergedParticipantRows(row: CallLogRow) {
  return [...row.participants, ...(row.session?.participants ?? [])];
}

function isAiReceptionistRow(
  row: CallLogRow,
  aiByCallLogId: Set<string>,
  aiByCallSid: Set<string>
) {
  if (aiByCallLogId.has(row.id) || aiByCallSid.has(row.twilioCallSid)) return true;
  const note = row.dispositionNote?.toLowerCase() ?? "";
  return note.includes("ai receptionist") || note.includes("ai agent");
}

/** Human who picked up / handled the live call — not who later saved wrap-up. */
function resolveHumanEmployee(row: CallLogRow) {
  if (row.conversion?.answeredBy) return row.conversion.answeredBy;
  if (row.user) return row.user;

  for (const role of STAFF_ROLES) {
    const participant = mergedParticipantRows(row).find(
      (p) => p.role === role && (p.user || (p.displayName && p.displayName !== "Unknown"))
    );
    if (participant?.user) return participant.user;
    if (participant?.displayName && participant.displayName !== "Unknown") {
      return { id: participant.id, name: participant.displayName };
    }
  }

  if (row.session?.assignedUser) return row.session.assignedUser;
  if (row.handledBy) return row.handledBy;
  return null;
}

function resolveEmployee(
  row: CallLogRow,
  isAiAgent: boolean
): { id: string; name: string } | null {
  const human = resolveHumanEmployee(row);
  if (human) return human;
  if (isAiAgent) return { ...AI_AGENT };
  return null;
}

function mapParticipants(row: CallLogRow): CallHistoryDetail["participants"] {
  const raw = mergedParticipantRows(row);
  const seen = new Set<string>();
  const out: CallHistoryDetail["participants"] = [];
  for (const p of raw) {
    const name = p.user?.name ?? p.displayName ?? "Unknown";
    if (name === "Unknown" && !p.user && !p.phoneE164) continue;
    const key = `${p.user?.id ?? name}:${p.role}:${p.phoneE164 ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: p.user?.id ?? p.id,
      name,
      role: p.role,
      phoneE164: p.phoneE164,
      joinedAt: p.joinedAt.toISOString(),
    });
  }
  return out;
}

function mapCallLog(
  row: CallLogRow,
  aiByCallLogId: Set<string>,
  aiByCallSid: Set<string>
): CallHistoryListItem {
  const isAiAgent = isAiReceptionistRow(row, aiByCallLogId, aiByCallSid);
  const employee = resolveEmployee(row, isAiAgent);
  return {
    id: row.id,
    direction: row.direction,
    status: row.status,
    durationSec: row.durationSec,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    fromNumber: row.fromNumber,
    toNumber: row.toNumber,
    answered: isCallAnswered(row.status, row.durationSec) || isAiAgent,
    hasRecording: Boolean(row.recordingUrl),
    hasTranscript: Boolean(row.transcript?.trim()),
    hasSummary: Boolean(row.aiSummary?.trim()),
    isAiAgent,
    customer: row.customer,
    employee: employee ? { id: employee.id, name: employee.name } : null,
  };
}

function toDetail(
  row: CallLogRow,
  aiByCallLogId: Set<string>,
  aiByCallSid: Set<string>
): CallHistoryDetail {
  const participants = mapParticipants(row);
  const base = mapCallLog(row, aiByCallLogId, aiByCallSid);
  const employee = resolveEmployee(row, base.isAiAgent);
  return {
    ...base,
    employee: employee ? { id: employee.id, name: employee.name } : base.employee,
    recordingPlaybackUrl: row.recordingUrl ? callRecordingPlaybackPath(row.id) : null,
    transcript: row.transcript,
    aiSummary: row.aiSummary,
    visitId: row.visitId,
    participants,
    handledBy: employee,
  };
}

async function loadAiReceptionistIndexes(rows: CallLogRow[]) {
  const aiByCallLogId = new Set<string>();
  const aiByCallSid = new Set<string>();
  if (!rows.length) return { aiByCallLogId, aiByCallSid };

  const callLogIds = rows.map((r) => r.id);
  const callSids = rows.map((r) => r.twilioCallSid);
  const receptionistCalls = await prisma.receptionistCall.findMany({
    where: {
      OR: [{ callLogId: { in: callLogIds } }, { callSid: { in: callSids } }],
    },
    select: { callLogId: true, callSid: true },
  });
  for (const call of receptionistCalls) {
    if (call.callLogId) aiByCallLogId.add(call.callLogId);
    aiByCallSid.add(call.callSid);
  }
  return { aiByCallLogId, aiByCallSid };
}

export async function listCallHistory(
  companyId: string,
  take = CALL_HISTORY_UI_LIMIT
): Promise<CallHistoryListItem[]> {
  const rows = await prisma.callLog.findMany({
    where: { companyId, scope: "EXTERNAL" },
    include: callLogInclude,
    orderBy: { startedAt: "desc" },
    take,
  });
  const { aiByCallLogId, aiByCallSid } = await loadAiReceptionistIndexes(rows);
  return rows.map((row) => mapCallLog(row, aiByCallLogId, aiByCallSid));
}

export async function listCustomerCallHistory(
  companyId: string,
  customerId: string,
  take = 50
): Promise<CallHistoryDetail[]> {
  const rows = await prisma.callLog.findMany({
    where: { companyId, customerId, scope: "EXTERNAL" },
    include: callLogInclude,
    orderBy: { startedAt: "desc" },
    take,
  });
  const { aiByCallLogId, aiByCallSid } = await loadAiReceptionistIndexes(rows);
  return rows.map((row) => toDetail(row, aiByCallLogId, aiByCallSid));
}

export async function getCallHistoryDetail(
  companyId: string,
  id: string
): Promise<CallHistoryDetail | null> {
  const row = await prisma.callLog.findFirst({
    where: { id, companyId },
    include: callLogInclude,
  });
  if (!row) return null;
  const { aiByCallLogId, aiByCallSid } = await loadAiReceptionistIndexes([row]);
  return toDetail(row, aiByCallLogId, aiByCallSid);
}
