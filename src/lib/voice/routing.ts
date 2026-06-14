import {
  AgentPresenceStatus,
  CallDirection,
  CallFlowNodeType,
  CallSessionStatus,
  RingStrategy,
} from "@prisma/client";
import twilio from "twilio";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/inbox/contacts";
import { getCompanyByTwilioPhone } from "@/lib/inbox/conversations";
import { appBaseUrl, voiceClientIdentity } from "./identity";
import { getAvailableAgentIdentities, getNextRoundRobinAgent } from "./presence";

type TwilioParams = Record<string, string>;

function isWithinBusinessHours(businessHours: unknown): boolean {
  if (!businessHours || typeof businessHours !== "object") return true;
  const now = new Date();
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const dayKey = dayNames[now.getDay()];
  const slot = (businessHours as Record<string, { open?: boolean; start?: string; end?: string }>)[dayKey];
  if (!slot?.open) return false;
  if (!slot.start || !slot.end) return true;
  const [sh, sm] = slot.start.split(":").map(Number);
  const [eh, em] = slot.end.split(":").map(Number);
  const mins = now.getHours() * 60 + now.getMinutes();
  return mins >= sh * 60 + sm && mins <= eh * 60 + em;
}

async function resolveCustomer(companyId: string, phone: string) {
  const normalized = normalizePhone(phone);
  return prisma.customer.findFirst({
    where: { companyId, phone: normalized },
    select: { id: true, name: true, phone: true },
  });
}

async function createInboundSession(params: {
  companyId: string;
  callSid: string;
  from: string;
  to: string;
  customerId?: string;
  phoneNumberId?: string;
}) {
  return prisma.callSession.upsert({
    where: { callSid: params.callSid },
    create: {
      companyId: params.companyId,
      callSid: params.callSid,
      direction: CallDirection.INBOUND,
      status: CallSessionStatus.RINGING,
      fromNumber: params.from,
      toNumber: params.to,
      customerId: params.customerId,
      phoneNumberId: params.phoneNumberId,
    },
    update: {
      status: CallSessionStatus.RINGING,
    },
  });
}

async function dialAgentGroup(
  dial: ReturnType<twilio.twiml.VoiceResponse["dial"]>,
  companyId: string,
  groupId: string,
  strategy: RingStrategy
) {
  if (strategy === RingStrategy.ROUND_ROBIN) {
    const identity = await getNextRoundRobinAgent(companyId, groupId);
    if (identity) {
      dial.client({}, identity);
      return;
    }
  }

  if (strategy === RingStrategy.SEQUENTIAL) {
    const group = await prisma.agentGroup.findFirst({
      where: { id: groupId, companyId },
      include: { members: { orderBy: { sortOrder: "asc" } } },
    });
    for (const member of group?.members ?? []) {
      const presence = await prisma.agentPresence.findUnique({ where: { userId: member.userId } });
      if (presence?.status === AgentPresenceStatus.AVAILABLE) {
        dial.client({}, voiceClientIdentity(companyId, member.userId));
        return;
      }
    }
    return;
  }

  const identities = await getAvailableAgentIdentities(companyId);
  const group = await prisma.agentGroup.findFirst({
    where: { id: groupId, companyId },
    include: { members: true },
  });
  const memberIds = new Set(group?.members.map((m) => m.userId) ?? []);
  const filtered = identities.filter((id) => {
    const userId = id.split("_").slice(1).join("_");
    return memberIds.has(userId);
  });

  for (const identity of filtered.length ? filtered : identities) {
    dial.client({}, identity);
  }
}

export async function buildInboundTwiml(params: TwilioParams) {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();
  const to = params.To;
  const from = params.From;
  const callSid = params.CallSid;

  const company = await getCompanyByTwilioPhone(to);
  if (!company) {
    response.say("This number is not configured.");
    return response.toString();
  }

  const customer = from ? await resolveCustomer(company.id, from) : null;
  const phoneRecord = await prisma.phoneNumber.findFirst({
    where: { companyId: company.id, e164: normalizePhone(to) },
    include: {
      callFlow: { include: { nodes: { orderBy: { sortOrder: "asc" } } } },
    },
  });

  if (callSid && from) {
    await createInboundSession({
      companyId: company.id,
      callSid,
      from: normalizePhone(from),
      to,
      customerId: customer?.id,
      phoneNumberId: phoneRecord?.id,
    });
  }

  if (!isWithinBusinessHours(company.businessHours) && phoneRecord?.callFlow?.afterHoursNodeId) {
    const afterNode = phoneRecord.callFlow.nodes.find((n) => n.id === phoneRecord.callFlow!.afterHoursNodeId);
    if (afterNode?.type === CallFlowNodeType.VOICEMAIL) {
      response.say("Please leave a message after the tone.");
      response.record({
        maxLength: 120,
        recordingStatusCallback: `${appBaseUrl()}/api/twilio/voice/recording`,
        transcribe: company.transcribeCalls,
        transcribeCallback: company.transcribeCalls
          ? `${appBaseUrl()}/api/twilio/voice/transcription`
          : undefined,
      });
      return response.toString();
    }
  }

  const entryNode =
    phoneRecord?.callFlow?.nodes.find((n) => n.id === phoneRecord.callFlow?.entryNodeId) ??
    phoneRecord?.callFlow?.nodes[0];

  if (entryNode?.type === CallFlowNodeType.IVR) {
    const config = entryNode.config as { prompt?: string; actionUrl?: string };
    const gather = response.gather({
      numDigits: 1,
      action: `${appBaseUrl()}/api/twilio/voice/ivr?flowId=${phoneRecord!.callFlow!.id}&nodeId=${entryNode.id}`,
      method: "POST",
    });
    gather.say(config.prompt ?? "Press 1 for service.");
    response.say("We did not receive your input. Goodbye.");
    return response.toString();
  }

  if (entryNode?.type === CallFlowNodeType.FORWARD) {
    const config = entryNode.config as { forwardTo?: string };
    if (config.forwardTo) {
      response.dial({}, normalizePhone(config.forwardTo));
    } else {
      response.say("Forward destination not configured.");
    }
    return response.toString();
  }

  if (entryNode?.type === CallFlowNodeType.HANGUP) {
    response.say("Goodbye.");
    response.hangup();
    return response.toString();
  }

  if (entryNode?.type === CallFlowNodeType.DIAL_GROUP) {
    const config = entryNode.config as { groupId?: string };
    const groupId = config.groupId;
    const group = groupId
      ? await prisma.agentGroup.findFirst({ where: { id: groupId, companyId: company.id } })
      : await prisma.agentGroup.findFirst({ where: { companyId: company.id } });

    const dial = response.dial({
      timeout: group?.ringTimeoutSec ?? 30,
      action: `${appBaseUrl()}/api/twilio/voice/queue?companyId=${company.id}`,
      method: "POST",
      callerId: from,
    });

    if (group) {
      await dialAgentGroup(dial, company.id, group.id, group.ringStrategy);
    } else {
      const identities = await getAvailableAgentIdentities(company.id);
      if (identities.length) {
        for (const identity of identities) {
          dial.client({}, identity);
        }
      } else {
        response.say("No agents are available. Please try again later.");
      }
    }
    return response.toString();
  }

  if (entryNode?.type === CallFlowNodeType.QUEUE) {
    response.enqueue(
      { waitUrl: `${appBaseUrl()}/api/twilio/voice/queue/wait` },
      `company_${company.id}`
    );
    return response.toString();
  }

  const dial = response.dial({
    timeout: 30,
    action: `${appBaseUrl()}/api/twilio/voice/queue?companyId=${company.id}`,
    method: "POST",
    callerId: from,
  });
  const identities = await getAvailableAgentIdentities(company.id);
  if (identities.length) {
    for (const identity of identities) {
      dial.client({}, identity);
    }
  } else {
    response.say("No agents are available.");
  }
  return response.toString();
}

export async function buildClientOutboundTwiml(params: TwilioParams) {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();
  const to = params.To ?? params.to;
  const companyId = params.companyId;
  const customerId = params.customerId;

  if (!to || !companyId) {
    response.say("Missing call destination.");
    return response.toString();
  }

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company?.twilioPhone) {
    response.say("Company phone not configured.");
    return response.toString();
  }

  const normalizedTo = normalizePhone(to);
  const dial = response.dial({
    callerId: company.twilioPhone,
    record: company.recordCalls ? "record-from-answer-dual" : undefined,
    recordingStatusCallback: company.recordCalls
      ? `${appBaseUrl()}/api/twilio/voice/recording`
      : undefined,
  });

  dial.number({}, normalizedTo);

  if (params.CallSid) {
    await prisma.callSession.upsert({
      where: { callSid: params.CallSid },
      create: {
        companyId,
        callSid: params.CallSid,
        direction: CallDirection.OUTBOUND,
        status: CallSessionStatus.IN_PROGRESS,
        fromNumber: company.twilioPhone,
        toNumber: normalizedTo,
        customerId: customerId || null,
        assignedUserId: params.userId || null,
      },
      update: { status: CallSessionStatus.IN_PROGRESS },
    });
  }

  return response.toString();
}

export async function buildQueueTwiml(companyId: string) {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();
  response.enqueue({ waitUrl: `${appBaseUrl()}/api/twilio/voice/queue/wait` }, `company_${companyId}`);
  return response.toString();
}

export async function buildQueueWaitTwiml() {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();
  response.play({ loop: 0 }, "http://com.twilio.sounds.music.s3.amazonaws.com/MarkovChamberlain_-_Ready.mp3");
  return response.toString();
}
