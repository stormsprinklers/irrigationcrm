import { prisma } from "@/lib/prisma";
import { getTwilioClient } from "@/lib/inbox/twilio";

export type ResolvedCallSession = {
  id: string;
  status: string;
  assignedUserId: string | null;
  callSid: string;
  agentCallSid: string | null;
  conferenceSid: string | null;
  direction: "INBOUND" | "OUTBOUND";
  toNumber: string;
  inboundLineTitle: string | null;
  trackingSource: string | null;
  inboundLineE164: string | null;
};

const sessionSelect = {
  id: true,
  status: true,
  assignedUserId: true,
  callSid: true,
  agentCallSid: true,
  conferenceSid: true,
  direction: true,
  toNumber: true,
  phoneNumber: {
    select: { friendlyName: true, trackingSource: true, e164: true },
  },
} as const;

type SessionRow = {
  id: string;
  status: string;
  assignedUserId: string | null;
  callSid: string;
  agentCallSid: string | null;
  conferenceSid: string | null;
  direction: "INBOUND" | "OUTBOUND";
  toNumber: string;
  phoneNumber: {
    friendlyName: string | null;
    trackingSource: string | null;
    e164: string;
  } | null;
};

function mapSession(row: SessionRow, logTrackingSource?: string | null): ResolvedCallSession {
  const isInbound = row.direction === "INBOUND";
  return {
    id: row.id,
    status: row.status,
    assignedUserId: row.assignedUserId,
    callSid: row.callSid,
    agentCallSid: row.agentCallSid,
    conferenceSid: row.conferenceSid,
    direction: row.direction,
    toNumber: row.toNumber,
    inboundLineTitle: isInbound ? row.phoneNumber?.friendlyName?.trim() || null : null,
    trackingSource: isInbound
      ? logTrackingSource?.trim() || row.phoneNumber?.trackingSource?.trim() || null
      : null,
    inboundLineE164: isInbound
      ? row.phoneNumber?.e164?.trim() || row.toNumber || null
      : null,
  };
}

async function withLogSource(companyId: string, row: SessionRow): Promise<ResolvedCallSession> {
  const log = await prisma.callLog.findFirst({
    where: { companyId, sessionId: row.id },
    select: { trackingSource: true },
    orderBy: { startedAt: "desc" },
  });
  return mapSession(row, log?.trackingSource);
}

/**
 * Softphone CallSid often differs from the inbound PSTN CallSid stored on CallSession.
 * Resolve using exact match, agentCallSid, CallLog, or Twilio ParentCallSid.
 */
export async function resolveCallSessionBySids(
  companyId: string,
  callSid: string | null | undefined,
  parentCallSid?: string | null
): Promise<ResolvedCallSession | null> {
  const sids = [callSid, parentCallSid].filter(Boolean) as string[];
  if (!sids.length) return null;

  const byCallSid = await prisma.callSession.findFirst({
    where: { companyId, callSid: { in: sids } },
    select: sessionSelect,
  });
  if (byCallSid) return withLogSource(companyId, byCallSid);

  const byAgent = await prisma.callSession.findFirst({
    where: { companyId, agentCallSid: { in: sids } },
    select: sessionSelect,
  });
  if (byAgent) return withLogSource(companyId, byAgent);

  const log = await prisma.callLog.findFirst({
    where: { companyId, twilioCallSid: { in: sids } },
    select: { sessionId: true, trackingSource: true },
    orderBy: { startedAt: "desc" },
  });
  if (log?.sessionId) {
    const byLog = await prisma.callSession.findFirst({
      where: { id: log.sessionId, companyId },
      select: sessionSelect,
    });
    if (byLog) return mapSession(byLog, log.trackingSource);
  }

  // Softphone child → resolve ParentCallSid from Twilio
  if (callSid) {
    try {
      const client = getTwilioClient();
      const call = await client.calls(callSid).fetch();
      const parent = call.parentCallSid;
      if (parent && parent !== callSid) {
        const byParent = await prisma.callSession.findFirst({
          where: { companyId, callSid: parent },
          select: sessionSelect,
        });
        if (byParent) return withLogSource(companyId, byParent);
      }
    } catch {
      // ignore Twilio lookup failures
    }
  }

  return null;
}
