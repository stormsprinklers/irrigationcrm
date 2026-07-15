import { CallSessionStatus, TransferType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getTwilioClient } from "@/lib/inbox/twilio";
import { getCompanyCallerId } from "@/lib/voice/company-phone";
import { normalizePhone } from "@/lib/inbox/phone";
import { appBaseUrl, voiceClientIdentity } from "./identity";

export async function getSessionForCompany(companyId: string, sessionId: string) {
  return prisma.callSession.findFirst({
    where: { id: sessionId, companyId },
  });
}

export function conferenceName(sessionId: string) {
  return `session_${sessionId}`;
}

export function conferenceJoinTwiml(sessionId: string, options?: {
  endConferenceOnExit?: boolean;
  record?: boolean;
}) {
  const endOnExit = options?.endConferenceOnExit ?? false;
  const record = options?.record ?? false;
  const name = conferenceName(sessionId);
  const recordAttrs = record
    ? ` record="record-from-start" recordingStatusCallback="${appBaseUrl()}/api/twilio/voice/recording" recordingStatusCallbackMethod="POST"`
    : "";
  return `<Response><Dial><Conference beep="false" startConferenceOnEnter="true" endConferenceOnExit="${endOnExit}" statusCallback="${appBaseUrl()}/api/twilio/voice/conference/status" statusCallbackEvent="start end join leave"${recordAttrs}>${name}</Conference></Dial></Response>`;
}

async function findConferenceSid(sessionId: string, storedSid: string | null) {
  if (storedSid) {
    try {
      const client = getTwilioClient();
      const conf = await client.conferences(storedSid).fetch();
      if (conf.status === "in-progress") return storedSid;
    } catch {
      // fall through to name lookup
    }
  }
  const client = getTwilioClient();
  const conferences = await client.conferences.list({
    friendlyName: conferenceName(sessionId),
    status: "in-progress",
    limit: 1,
  });
  return conferences[0]?.sid ?? null;
}

async function waitForConference(sessionId: string, attempts = 8): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    const sid = await findConferenceSid(sessionId, null);
    if (sid) return sid;
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

async function latestCallLogId(sessionId: string) {
  const log = await prisma.callLog.findFirst({
    where: { sessionId },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });
  return log?.id ?? null;
}

export async function recordCallParticipant(input: {
  companyId: string;
  callSessionId: string;
  userId?: string | null;
  displayName?: string | null;
  phoneE164?: string | null;
  role: "ANSWERED" | "AGENT_TRANSFER" | "EXTERNAL_TRANSFER";
}) {
  const callLogId = await latestCallLogId(input.callSessionId);
  const user =
    input.userId
      ? await prisma.user.findFirst({
          where: { id: input.userId, companyId: input.companyId },
          select: { id: true, name: true },
        })
      : null;

  return prisma.callParticipant.create({
    data: {
      companyId: input.companyId,
      callSessionId: input.callSessionId,
      callLogId,
      userId: user?.id ?? null,
      displayName: input.displayName ?? user?.name ?? null,
      phoneE164: input.phoneE164 ? normalizePhone(input.phoneE164) : null,
      role: input.role,
    },
  });
}

/**
 * Move customer (parent) + agent (softphone) legs into a recorded conference.
 * Agent uses endConferenceOnExit=false so they can leave without killing the call.
 */
export async function ensureInConference(sessionId: string): Promise<string> {
  const session = await prisma.callSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new Error("Session not found");

  let conferenceSid = await findConferenceSid(sessionId, session.conferenceSid);
  if (conferenceSid) {
    if (session.conferenceSid !== conferenceSid) {
      await prisma.callSession.update({
        where: { id: sessionId },
        data: { conferenceSid },
      });
    }
    return conferenceSid;
  }

  const client = getTwilioClient();
  const company = await prisma.company.findUnique({
    where: { id: session.companyId },
    select: { recordCalls: true },
  });
  const shouldRecord = Boolean(company?.recordCalls);

  // Join agent first (so conference is waiting), then customer with recording.
  const agentSid = session.agentCallSid;
  if (agentSid) {
    try {
      await client.calls(agentSid).update({
        twiml: conferenceJoinTwiml(sessionId, { endConferenceOnExit: false, record: false }),
      });
    } catch (err) {
      console.error("Failed to move agent into conference", err);
    }
  }

  try {
    await client.calls(session.callSid).update({
      twiml: conferenceJoinTwiml(sessionId, {
        endConferenceOnExit: true,
        record: shouldRecord,
      }),
    });
  } catch (err) {
    console.error("Failed to move customer into conference", err);
    throw new Error("Could not place call into conference — hold/transfer unavailable");
  }

  const startedSid = await waitForConference(sessionId);
  if (!startedSid) {
    throw new Error("Conference did not start — try again in a moment");
  }

  await prisma.callSession.update({
    where: { id: sessionId },
    data: { conferenceSid: startedSid },
  });

  return startedSid;
}

export async function toggleHold(sessionId: string, hold: boolean) {
  const session = await prisma.callSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new Error("Session not found");

  const client = getTwilioClient();
  const conferenceSid = await ensureInConference(sessionId);

  const participants = await client.conferences(conferenceSid).participants.list();
  // Hold only the customer (PSTN parent) leg so the CSR can still talk / hear hold status.
  const customerParticipant = participants.find((p) => p.callSid === session.callSid);
  if (customerParticipant) {
    await client.conferences(conferenceSid).participants(session.callSid).update({ hold });
  } else if (participants.length) {
    // Fallback: hold the non-agent participant
    for (const p of participants) {
      if (session.agentCallSid && p.callSid === session.agentCallSid) continue;
      if (p.label === "consult" || p.label === "external") continue;
      await client.conferences(conferenceSid).participants(p.callSid).update({ hold });
      break;
    }
  }

  await prisma.callSession.update({
    where: { id: sessionId },
    data: {
      conferenceSid,
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

  // Prefer conference if already in one: add target and let CSR leave.
  const existing = await findConferenceSid(sessionId, session.conferenceSid);
  if (existing || session.agentCallSid) {
    const conferenceSid = existing ?? (await ensureInConference(sessionId));
    await client.conferences(conferenceSid).participants.create({
      from: session.toNumber,
      to: `client:${targetIdentity}`,
      label: "consult",
      earlyMedia: true,
      endConferenceOnExit: false,
    });
    await recordCallParticipant({
      companyId,
      callSessionId: sessionId,
      userId: targetUserId,
      role: "AGENT_TRANSFER",
    });
    return prisma.callSession.update({
      where: { id: sessionId },
      data: {
        conferenceSid,
        status: CallSessionStatus.TRANSFERRING,
        transferType: TransferType.COLD,
        transferTargetUserId: targetUserId,
        assignedUserId: targetUserId,
      },
    });
  }

  await client.calls(session.callSid).update({
    twiml: `<Response><Dial><Client>${targetIdentity}</Client></Dial></Response>`,
  });

  await recordCallParticipant({
    companyId,
    callSessionId: sessionId,
    userId: targetUserId,
    role: "AGENT_TRANSFER",
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
  const conferenceSid = await ensureInConference(sessionId);

  await client.conferences(conferenceSid).participants.create({
    from: session.toNumber,
    to: `client:${targetIdentity}`,
    label: "consult",
    earlyMedia: true,
    endConferenceOnExit: false,
  });

  await recordCallParticipant({
    companyId,
    callSessionId: sessionId,
    userId: targetUserId,
    role: "AGENT_TRANSFER",
  });

  return prisma.callSession.update({
    where: { id: sessionId },
    data: {
      conferenceSid,
      status: CallSessionStatus.TRANSFERRING,
      transferType: TransferType.WARM,
      transferTargetUserId: targetUserId,
    },
  });
}

/**
 * Transfer by ringing an employee's personal phone from the company number
 * and bridging everyone into the same conference.
 */
export async function externalPhoneTransfer(
  companyId: string,
  sessionId: string,
  targetUserId: string,
  type: "warm" | "cold" = "warm"
) {
  const session = await getSessionForCompany(companyId, sessionId);
  if (!session) throw new Error("Session not found");

  const employee = await prisma.user.findFirst({
    where: { id: targetUserId, companyId, status: "ACTIVE" },
    select: { id: true, name: true, phone: true },
  });
  if (!employee?.phone?.trim()) {
    throw new Error("Employee does not have a phone number on file");
  }

  const callerId = (await getCompanyCallerId(companyId)) ?? session.toNumber;
  const toPhone = normalizePhone(employee.phone);
  const client = getTwilioClient();
  const conferenceSid = await ensureInConference(sessionId);

  await client.conferences(conferenceSid).participants.create({
    from: callerId,
    to: toPhone,
    label: "external",
    earlyMedia: true,
    endConferenceOnExit: false,
  });

  await recordCallParticipant({
    companyId,
    callSessionId: sessionId,
    userId: employee.id,
    displayName: employee.name,
    phoneE164: toPhone,
    role: "EXTERNAL_TRANSFER",
  });

  return prisma.callSession.update({
    where: { id: sessionId },
    data: {
      conferenceSid,
      status: CallSessionStatus.TRANSFERRING,
      transferType: type === "warm" ? TransferType.WARM : TransferType.COLD,
      transferTargetUserId: targetUserId,
      ...(type === "cold" ? { assignedUserId: targetUserId } : {}),
    },
  });
}

/** CSR leaves after warm transfer — call/recording continue for remaining parties. */
export async function leaveCallAfterTransfer(companyId: string, sessionId: string) {
  const session = await getSessionForCompany(companyId, sessionId);
  if (!session) throw new Error("Session not found");

  if (session.transferTargetUserId) {
    await prisma.callSession.update({
      where: { id: sessionId },
      data: {
        assignedUserId: session.transferTargetUserId,
        status: CallSessionStatus.IN_PROGRESS,
        transferType: null,
        transferTargetUserId: null,
      },
    });
  }

  // Softphone hangup with endConferenceOnExit=false keeps conference alive.
  return session;
}

export async function completeWarmTransfer(companyId: string, sessionId: string) {
  return leaveCallAfterTransfer(companyId, sessionId);
}
