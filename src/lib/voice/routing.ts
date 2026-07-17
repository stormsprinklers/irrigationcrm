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
import { localTimeParts } from "./hours-branch";
import { renderIvrGather, renderIvrNode, type FlowContext, type IvrNodeConfig } from "./ivr";
import { getAvailableAgentIdentities, getNextRoundRobinAgent } from "./presence";

function flowNodeBranch(config: unknown): "open" | "closed" {
  const branch = (config as { branch?: string } | null)?.branch;
  return branch === "closed" ? "closed" : "open";
}

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
  const branch = flowNodeBranch(entryNode.config);
  const later = nodes
    .filter(
      (n) =>
        n.sortOrder > entryNode.sortOrder &&
        flowNodeBranch(n.config) === branch &&
        (n.type === CallFlowNodeType.DIAL_GROUP || n.type === CallFlowNodeType.DIAL_USER)
    )
    .sort((a, b) => a.sortOrder - b.sortOrder);
  if (later[0]) return later[0];
  return (
    nodes.find(
      (n) =>
        flowNodeBranch(n.config) === branch &&
        (n.type === CallFlowNodeType.DIAL_GROUP || n.type === CallFlowNodeType.DIAL_USER)
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

function isWithinBusinessHours(
  businessHours: unknown,
  timezone?: string | null
): boolean {
  if (!businessHours || typeof businessHours !== "object") return true;
  const { day, minutes } = localTimeParts(timezone);
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const dayKey = dayNames[day];
  const slot = (businessHours as Record<string, { open?: boolean; start?: string; end?: string }>)[
    dayKey
  ];
  if (!slot?.open) return false;
  if (!slot.start || !slot.end) return true;
  const [sh, sm] = slot.start.split(":").map(Number);
  const [eh, em] = slot.end.split(":").map(Number);
  return minutes >= sh * 60 + sm && minutes <= eh * 60 + em;
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

  let callSessionId: string | undefined;
  if (callSid && from) {
    const session = await createInboundSession({
      companyId: company.id,
      callSid,
      from: normalizePhone(from),
      to,
      customerId: customer?.id,
      phoneNumberId: phoneRecord?.id,
    });
    callSessionId = session.id;
  }

  const baseCtx = (): FlowContext => ({
    flowId: phoneRecord?.callFlow?.id ?? "",
    companyId: company.id,
    from,
    to,
    callSid,
    callSessionId,
    recordCalls: company.recordCalls,
    transcribeCalls: company.transcribeCalls,
  });

  if (
    !isWithinBusinessHours(company.businessHours, company.timezone) &&
    phoneRecord?.callFlow?.afterHoursNodeId
  ) {
    const afterNode = phoneRecord.callFlow.nodes.find(
      (n) => n.id === phoneRecord.callFlow!.afterHoursNodeId
    );
    if (afterNode) {
      return renderIvrNode(afterNode, phoneRecord.callFlow.nodes, {
        ...baseCtx(),
        flowId: phoneRecord.callFlow.id,
      });
    }
  }

  const entryNode =
    phoneRecord?.callFlow?.nodes.find((n) => n.id === phoneRecord.callFlow?.entryNodeId) ??
    phoneRecord?.callFlow?.nodes[0];

  if (entryNode && phoneRecord?.callFlow) {
    const ctx: FlowContext = {
      ...baseCtx(),
      flowId: phoneRecord.callFlow.id,
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
  response.enqueue(
    {
      waitUrl: `${appBaseUrl()}/api/twilio/voice/queue/wait?companyId=${encodeURIComponent(companyId)}`,
    },
    `company_${companyId}`
  );
  return response.toString();
}

type QueueWaitOptions = {
  companyId: string | null;
  flowId?: string | null;
  nodeId?: string | null;
  /** Digit pressed while waiting (from Gather action). */
  digits?: string | null;
};

/** Wait music for callers in queue — optional Gather for voicemail escape key. */
export async function buildQueueWaitTwiml(options: QueueWaitOptions | string | null) {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();

  const opts: QueueWaitOptions =
    typeof options === "string" || options === null
      ? { companyId: options }
      : options;

  const { companyId, flowId, nodeId, digits } = opts;

  let voicemailDigit: string | null = null;
  if (companyId && flowId && nodeId) {
    const node = await prisma.callFlowNode.findFirst({
      where: { id: nodeId, flowId, flow: { companyId } },
      select: { config: true },
    });
    const config = (node?.config ?? {}) as { voicemailDigit?: string };
    voicemailDigit = config.voicemailDigit?.trim() || null;
  }

  if (digits && voicemailDigit && digits === voicemailDigit) {
    response.leave();
    return response.toString();
  }

  const waitQuery = new URLSearchParams();
  if (companyId) waitQuery.set("companyId", companyId);
  if (flowId) waitQuery.set("flowId", flowId);
  if (nodeId) waitQuery.set("nodeId", nodeId);
  const waitUrl = `${appBaseUrl()}/api/twilio/voice/queue/wait?${waitQuery.toString()}`;

  let playUrl: string | null = null;
  if (companyId) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { queueWaitClipId: true },
    });
    if (company?.queueWaitClipId) {
      const { resolveVoiceClipPlayUrl } = await import("@/lib/voice/ivr");
      playUrl = await resolveVoiceClipPlayUrl(company.queueWaitClipId, companyId);
    }
  }

  if (voicemailDigit) {
    const gather = response.gather({
      numDigits: 1,
      timeout: 3,
      action: waitUrl,
      method: "POST",
    });
    // Brief prompt so callers know the escape key even when wait music plays.
    gather.say(`Press ${voicemailDigit} at any time to leave a voicemail.`);
    if (playUrl) {
      gather.play({ loop: 0 }, playUrl);
    } else {
      gather.say("Please hold. An agent will be with you shortly.");
      gather.pause({ length: 8 });
    }
    // If gather times out without a digit, restart wait music.
    response.redirect({ method: "POST" }, waitUrl);
    return response.toString();
  }

  if (playUrl) {
    response.play({ loop: 0 }, playUrl);
    return response.toString();
  }

  response.say("Please hold. An agent will be with you shortly.");
  response.pause({ length: 8 });
  if (companyId) {
    response.redirect({ method: "POST" }, waitUrl);
  }
  return response.toString();
}

/** Hold music TwiML for mid-call hold — uses the company-configured hold clip. */
export async function buildHoldMusicTwiml(companyId: string | null) {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();

  if (companyId) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { holdMusicClipId: true },
    });
    if (company?.holdMusicClipId) {
      const { resolveVoiceClipPlayUrl } = await import("@/lib/voice/ivr");
      const playUrl = await resolveVoiceClipPlayUrl(company.holdMusicClipId, companyId);
      if (playUrl) {
        response.play({ loop: 0 }, playUrl);
        return response.toString();
      }
    }
  }

  response.say("Please remain on the line.");
  response.pause({ length: 8 });
  if (companyId) {
    response.redirect(
      `${appBaseUrl()}/api/twilio/voice/hold/music?companyId=${encodeURIComponent(companyId)}`
    );
  }
  return response.toString();
}
