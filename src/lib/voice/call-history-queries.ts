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

function mergedParticipantRows(row: CallLogRow) {
  return [...row.participants, ...(row.session?.participants ?? [])];
}

/** Who picked up / handled the live call — not who later saved wrap-up. */
function resolveEmployee(row: CallLogRow) {
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

function mapCallLog(row: CallLogRow): CallHistoryListItem {
  const employee = resolveEmployee(row);
  return {
    id: row.id,
    direction: row.direction,
    status: row.status,
    durationSec: row.durationSec,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    fromNumber: row.fromNumber,
    toNumber: row.toNumber,
    answered: isCallAnswered(row.status, row.durationSec),
    hasRecording: Boolean(row.recordingUrl),
    hasTranscript: Boolean(row.transcript?.trim()),
    hasSummary: Boolean(row.aiSummary?.trim()),
    customer: row.customer,
    employee: employee ? { id: employee.id, name: employee.name } : null,
  };
}

function toDetail(row: CallLogRow): CallHistoryDetail {
  const participants = mapParticipants(row);
  const base = mapCallLog(row);
  const employee = resolveEmployee(row);
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
  return rows.map(mapCallLog);
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
  return rows.map(toDetail);
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
  return toDetail(row);
}
