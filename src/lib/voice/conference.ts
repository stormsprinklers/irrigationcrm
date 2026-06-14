import { CallSessionStatus, TransferType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getTwilioClient } from "@/lib/inbox/twilio";
import { appBaseUrl, voiceClientIdentity } from "./identity";

export async function getSessionForCompany(companyId: string, sessionId: string) {
  return prisma.callSession.findFirst({
    where: { id: sessionId, companyId },
  });
}

function conferenceName(sessionId: string) {
  return `session_${sessionId}`;
}

async function findConferenceSid(sessionId: string, storedSid: string | null) {
  if (storedSid) return storedSid;
  const client = getTwilioClient();
  const conferences = await client.conferences.list({
    friendlyName: conferenceName(sessionId),
    status: "in-progress",
    limit: 1,
  });
  return conferences[0]?.sid ?? null;
}

export async function toggleHold(sessionId: string, hold: boolean) {
  const session = await prisma.callSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new Error("Session not found");

  const client = getTwilioClient();
  let conferenceSid = await findConferenceSid(sessionId, session.conferenceSid);

  if (!conferenceSid) {
    const name = conferenceName(sessionId);
    await client.calls(session.callSid).update({
      twiml: `<Response><Dial><Conference statusCallback="${appBaseUrl()}/api/twilio/voice/conference/status" statusCallbackEvent="start end">${name}</Conference></Dial></Response>`,
    });
    conferenceSid = await findConferenceSid(sessionId, null);
  }

  if (conferenceSid) {
    const participants = await client.conferences(conferenceSid).participants.list();
    for (const p of participants) {
      await client.conferences(conferenceSid).participants(p.callSid).update({ hold });
    }
  }

  await prisma.callSession.update({
    where: { id: sessionId },
    data: {
      conferenceSid: conferenceSid ?? session.conferenceSid,
      status: hold ? CallSessionStatus.ON_HOLD : CallSessionStatus.IN_PROGRESS,
      holdStartedAt: hold ? new Date() : null,
    },
  });

  return { conferenceSid, hold };
}

export async function coldTransfer(
  companyId: string,
  sessionId: string,
  targetUserId: string
) {
  const session = await getSessionForCompany(companyId, sessionId);
  if (!session) throw new Error("Session not found");

  const targetIdentity = voiceClientIdentity(companyId, targetUserId);
  const client = getTwilioClient();

  await client.calls(session.callSid).update({
    twiml: `<Response><Dial><Client>${targetIdentity}</Client></Dial></Response>`,
  });

  return prisma.callSession.update({
    where: { id: sessionId },
    data: {
      status: CallSessionStatus.TRANSFERRING,
      transferType: TransferType.COLD,
      transferTargetUserId: targetUserId,
      assignedUserId: targetUserId,
    },
  });
}

export async function warmTransfer(
  companyId: string,
  sessionId: string,
  targetUserId: string
) {
  const session = await getSessionForCompany(companyId, sessionId);
  if (!session) throw new Error("Session not found");

  const targetIdentity = voiceClientIdentity(companyId, targetUserId);
  const client = getTwilioClient();
  let conferenceSid = await findConferenceSid(sessionId, session.conferenceSid);

  if (!conferenceSid) {
    const name = conferenceName(sessionId);
    await client.calls(session.callSid).update({
      twiml: `<Response><Dial><Conference>${name}</Conference></Dial></Response>`,
    });
    conferenceSid = await findConferenceSid(sessionId, null);
  }

  if (conferenceSid) {
    await client.conferences(conferenceSid).participants.create({
      from: session.toNumber,
      to: `client:${targetIdentity}`,
      label: "consult",
    });
  }

  return prisma.callSession.update({
    where: { id: sessionId },
    data: {
      conferenceSid: conferenceSid ?? session.conferenceSid,
      status: CallSessionStatus.TRANSFERRING,
      transferType: TransferType.WARM,
      transferTargetUserId: targetUserId,
    },
  });
}

export async function completeWarmTransfer(companyId: string, sessionId: string) {
  const session = await getSessionForCompany(companyId, sessionId);
  if (!session?.transferTargetUserId) {
    throw new Error("No warm transfer in progress");
  }

  await prisma.callSession.update({
    where: { id: sessionId },
    data: {
      assignedUserId: session.transferTargetUserId,
      status: CallSessionStatus.IN_PROGRESS,
      transferType: null,
      transferTargetUserId: null,
    },
  });

  return session;
}
