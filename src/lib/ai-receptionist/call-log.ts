import { CallDirection, Scope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveInboundCallAttribution } from "@/lib/voice/call-attribution";

/**
 * Ensure a CallLog exists for an AI receptionist call so recordings and
 * live transcripts show up in call history like CSR-handled calls.
 */
export async function ensureReceptionistCallLog(input: {
  companyId: string;
  callSid: string;
  fromE164: string;
  toE164?: string | null;
  customerId?: string | null;
  callSessionId?: string | null;
  receptionistCallId: string;
}) {
  const existingBySid = await prisma.callLog.findUnique({
    where: { twilioCallSid: input.callSid },
  });
  if (existingBySid) {
    await prisma.receptionistCall.update({
      where: { id: input.receptionistCallId },
      data: { callLogId: existingBySid.id },
    });
    return existingBySid;
  }

  let sessionId = input.callSessionId ?? null;
  let phoneNumberId: string | null = null;
  if (sessionId) {
    const session = await prisma.callSession.findUnique({
      where: { id: sessionId },
      select: { id: true, phoneNumberId: true, customerId: true },
    });
    if (session) {
      phoneNumberId = session.phoneNumberId;
      if (!input.customerId && session.customerId) {
        input = { ...input, customerId: session.customerId };
      }
    } else {
      sessionId = null;
    }
  }
  if (!sessionId) {
    const session = await prisma.callSession.findUnique({
      where: { callSid: input.callSid },
      select: { id: true, phoneNumberId: true, customerId: true },
    });
    if (session) {
      sessionId = session.id;
      phoneNumberId = session.phoneNumberId;
      if (!input.customerId && session.customerId) {
        input = { ...input, customerId: session.customerId };
      }
    }
  }

  const attribution = await resolveInboundCallAttribution({
    companyId: input.companyId,
    callerNumber: input.fromE164,
    dialedNumber: input.toE164 ?? "",
    phoneNumberId,
  });

  const created = await prisma.callLog.create({
    data: {
      companyId: input.companyId,
      scope: Scope.EXTERNAL,
      direction: CallDirection.INBOUND,
      fromNumber: input.fromE164,
      toNumber: input.toE164 ?? "",
      customerId: input.customerId ?? null,
      twilioCallSid: input.callSid,
      sessionId,
      phoneNumberId: attribution.phoneNumberId ?? phoneNumberId,
      trackingSource: attribution.trackingSource ?? null,
      attributionMethod: attribution.method,
      googleLsaLeadId: attribution.googleLsaLeadId ?? null,
      status: "in-progress",
      dispositionNote: "AI receptionist",
    },
  });

  await prisma.receptionistCall.update({
    where: { id: input.receptionistCallId },
    data: { callLogId: created.id },
  });

  return created;
}
