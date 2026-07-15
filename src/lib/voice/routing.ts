import {
  AgentPresenceStatus,
  CallDirection,
  CallFlowNodeType,
  CallSessionStatus,
  RingStrategy,
  Scope,
} from "@prisma/client";
import twilio from "twilio";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/inbox/contacts";
import { getCompanyByTwilioPhone } from "@/lib/inbox/conversations";
import { lookupCustomerByPhone } from "@/lib/voice/caller-lookup";
import { getCompanyCallerId } from "@/lib/voice/company-phone";
import { getOutboundCommsState } from "@/lib/communications/outbound-guard";
import { appBaseUrl, voiceClientIdentity } from "./identity";
import { renderIvrGather, renderIvrNode, type FlowContext, type IvrNodeConfig } from "./ivr";
import { getAvailableAgentIdentities, getNextRoundRobinAgent } from "./presence";

type TwilioParams = Record<string, string>;

/** After a spam-gate IVR, prefer the "press 1" (or first) destination dial node. */
function resolvePostIvrDestination<
  T extends { id: string; type: CallFlowNodeType; sortOrder: number; config: unknown },
>(entryNode: T, nodes: T[]): T | null {
  const config = (entryNode.config ?? {}) as IvrNodeConfig;
  const option =
    config.options?.find((o) => o.digit === "1" && o.nextNodeId) ??
    config.options?.find((o) => o.nextNodeId);
  if (option?.nextNodeId) {
    const byId = nodes.find((n) => n.id === option.nextNodeId);
    if (byId) return byId;
  }
  const later = nodes
    .filter(
      (n) =>
        n.sortOrder > entryNode.sortOrder &&
        (n.type === CallFlowNodeType.DIAL_GROUP || n.type === CallFlowNodeType.DIAL_USER)
    )
    .sort((a, b) => a.sortOrder - b.sortOrder);
  if (later[0]) return later[0];
  return (
    nodes.find(
      (n) => n.type === CallFlowNodeType.DIAL_GROUP || n.type === CallFlowNodeType.DIAL_USER
    ) ?? null
  );
}

async function dialAvailableAgents(
  response: InstanceType<typeof twilio.twiml.VoiceResponse>,
  company: { id: string; recordCalls: boolean },
  from: string
) {
  const dial = response.dial(
    inboundDialAttributes(company, {
      timeout: 30,
      action: `${appBaseUrl()}/api/twilio/voice/dial-complete?companyId=${company.id}`,
      method: "POST",
      callerId: from,
    })
  );
  const identities = await getAvailableAgentIdentities(company.id);
  if (identities.length) {
    for (const identity of identities) {
      dial.client({}, identity);
    }
  } else {
    response.say("No agents are available.");
  }
}

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
  const lookup = await lookupCustomerByPhone(companyId, phone);
  if (!lookup.customerId) return null;
  return { id: lookup.customerId, name: lookup.name ?? "", phone: lookup.phone };
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

function inboundDialAttributes(
  company: { recordCalls: boolean },
  attrs: Record<string, unknown>
) {
  return {
    ...attrs,
    ...(company.recordCalls
      ? {
          record: "record-from-answer-dual" as const,
          recordingStatusCallback: `${appBaseUrl()}/api/twilio/voice/recording`,
          recordingStatusCallbackMethod: "POST" as const,
        }
      : {}),
  };
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
    const afterNode = phoneRecord.callFlow.nodes.find(
      (n) => n.id === phoneRecord.callFlow!.afterHoursNodeId
    );
    if (afterNode) {
      const ctx: FlowContext = {
        flowId: phoneRecord.callFlow.id,
        companyId: company.id,
        from,
        recordCalls: company.recordCalls,
        transcribeCalls: company.transcribeCalls,
      };
      return renderIvrNode(afterNode, phoneRecord.callFlow.nodes, ctx);
    }
  }

  const entryNode =
    phoneRecord?.callFlow?.nodes.find((n) => n.id === phoneRecord.callFlow?.entryNodeId) ??
    phoneRecord?.callFlow?.nodes[0];

  if (entryNode && phoneRecord?.callFlow) {
    const ctx: FlowContext = {
      flowId: phoneRecord.callFlow.id,
      companyId: company.id,
      from,
      recordCalls: company.recordCalls,
      transcribeCalls: company.transcribeCalls,
    };

    // Known customers skip spam-reduction IVR and ring CSRs directly (configurable).
    const skipIvr =
      company.skipIvrForKnownCustomers !== false &&
      Boolean(customer?.id) &&
      entryNode.type === CallFlowNodeType.IVR;

    if (skipIvr) {
      const destination = resolvePostIvrDestination(
        entryNode,
        phoneRecord.callFlow.nodes
      );
      if (destination) {
        return renderIvrNode(destination, phoneRecord.callFlow.nodes, ctx);
      }
      await dialAvailableAgents(response, company, from);
      return response.toString();
    }

    if (entryNode.type === CallFlowNodeType.IVR) {
      await renderIvrGather(response, entryNode, ctx);
      return response.toString();
    }

    return renderIvrNode(entryNode, phoneRecord.callFlow.nodes, ctx);
  }

  await dialAvailableAgents(response, company, from);
  return response.toString();
}

export async function buildClientOutboundTwiml(params: TwilioParams) {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();
  // Client SDK must send phoneNumber — Twilio overwrites reserved param names like "To".
  const to =
    params.phoneNumber ??
    params.PhoneNumber ??
    params.To ??
    params.to;
  const companyId = params.companyId;
  const customerId = params.customerId;

  if (!to?.trim() || !companyId) {
    response.say("Missing call destination.");
    return response.toString();
  }

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  const callerId = await getCompanyCallerId(companyId);
  if (!callerId || !company) {
    response.say("Company phone not configured.");
    return response.toString();
  }

  const freeze = await getOutboundCommsState(companyId);
  if (freeze.disabled) {
    response.say(
      "Outbound calling is currently disabled by your administrator. This call cannot be placed."
    );
    return response.toString();
  }

  const normalizedTo = normalizePhone(to);
  const statusUrl = `${appBaseUrl()}/api/twilio/voice/status`;
  const dial = response.dial({
    callerId,
    action: `${appBaseUrl()}/api/twilio/voice/dial-complete`,
    method: "POST",
    record: company.recordCalls ? "record-from-answer-dual" : undefined,
    recordingStatusCallback: company.recordCalls
      ? `${appBaseUrl()}/api/twilio/voice/recording`
      : undefined,
    recordingStatusCallbackMethod: company.recordCalls ? "POST" : undefined,
  });

  dial.number(
    {
      statusCallback: statusUrl,
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    },
    normalizedTo
  );

  if (params.CallSid) {
    const session = await prisma.callSession.upsert({
      where: { callSid: params.CallSid },
      create: {
        companyId,
        callSid: params.CallSid,
        direction: CallDirection.OUTBOUND,
        status: CallSessionStatus.IN_PROGRESS,
        fromNumber: callerId,
        toNumber: normalizedTo,
        customerId: customerId || null,
        assignedUserId: params.userId || null,
      },
      update: { status: CallSessionStatus.IN_PROGRESS },
    });

    await prisma.callLog.upsert({
      where: { twilioCallSid: params.CallSid },
      create: {
        companyId,
        scope: Scope.EXTERNAL,
        direction: CallDirection.OUTBOUND,
        fromNumber: callerId,
        toNumber: normalizedTo,
        customerId: customerId || null,
        userId: params.userId || null,
        sessionId: session.id,
        twilioCallSid: params.CallSid,
        status: "initiated",
      },
      update: {
        status: "initiated",
        toNumber: normalizedTo,
        customerId: customerId || null,
        userId: params.userId || null,
        sessionId: session.id,
      },
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
