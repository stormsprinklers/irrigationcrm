import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  type CallHistoryDetail,
  type CallHistoryListItem,
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
    },
  },
  conversion: {
    select: {
      answeredBy: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.CallLogInclude;

type CallLogRow = Prisma.CallLogGetPayload<{ include: typeof callLogInclude }>;

/** Who picked up / handled the live call — not who later saved wrap-up. */
function resolveEmployee(row: CallLogRow) {
  return (
    row.conversion?.answeredBy ??
    row.user ??
    row.session?.assignedUser ??
    row.handledBy ??
    null
  );
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

export async function listCallHistory(companyId: string, take = 100): Promise<CallHistoryListItem[]> {
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
  return rows.map((row) => {
    const base = mapCallLog(row);
    const employee = resolveEmployee(row);
    return {
      ...base,
      recordingPlaybackUrl: row.recordingUrl ? callRecordingPlaybackPath(row.id) : null,
      transcript: row.transcript,
      aiSummary: row.aiSummary,
      visitId: row.visitId,
      handledBy: employee,
    };
  });
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

  const base = mapCallLog(row);
  const employee = resolveEmployee(row);
  return {
    ...base,
    recordingPlaybackUrl: row.recordingUrl ? callRecordingPlaybackPath(row.id) : null,
    transcript: row.transcript,
    aiSummary: row.aiSummary,
    visitId: row.visitId,
    handledBy: employee,
  };
}
