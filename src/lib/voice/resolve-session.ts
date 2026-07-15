import { prisma } from "@/lib/prisma";
import { getTwilioClient } from "@/lib/inbox/twilio";

export type ResolvedCallSession = {
  id: string;
  status: string;
  assignedUserId: string | null;
  callSid: string;
  agentCallSid: string | null;
  conferenceSid: string | null;
};

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

  const select = {
    id: true,
    status: true,
    assignedUserId: true,
    callSid: true,
    agentCallSid: true,
    conferenceSid: true,
  } as const;

  const byCallSid = await prisma.callSession.findFirst({
    where: { companyId, callSid: { in: sids } },
    select,
  });
  if (byCallSid) return byCallSid;

  const byAgent = await prisma.callSession.findFirst({
    where: { companyId, agentCallSid: { in: sids } },
    select,
  });
  if (byAgent) return byAgent;

  const log = await prisma.callLog.findFirst({
    where: { companyId, twilioCallSid: { in: sids } },
    select: { sessionId: true },
    orderBy: { startedAt: "desc" },
  });
  if (log?.sessionId) {
    const byLog = await prisma.callSession.findFirst({
      where: { id: log.sessionId, companyId },
      select,
    });
    if (byLog) return byLog;
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
          select,
        });
        if (byParent) return byParent;
      }
    } catch {
      // ignore Twilio lookup failures
    }
  }

  return null;
}
