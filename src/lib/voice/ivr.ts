import {
  AgentPresenceStatus,
  CallFlowNode,
  CallFlowNodeType,
  RingStrategy,
} from "@prisma/client";
import twilio from "twilio";
import { blobProxyUrl } from "@/lib/blob/urls";
import { normalizePhone } from "@/lib/inbox/contacts";
import { prisma } from "@/lib/prisma";
import { appBaseUrl, voiceClientIdentity } from "./identity";
import { getAvailableAgentIdentities, getNextRoundRobinAgent } from "./presence";

export type IvrNodeConfig = {
  prompt?: string;
  promptText?: string;
  promptClipId?: string;
  forwardTo?: string;
  groupId?: string;
  /** Ring a specific user's apps (web softphone + iOS app via VoIP push). */
  userId?: string;
  /** Ring timeout in seconds before falling through (DIAL_GROUP / DIAL_USER). */
  timeoutSec?: number;
  options?: Array<{ digit: string; nextNodeId?: string; label?: string }>;
  timeoutNodeId?: string;
  invalidNodeId?: string;
};

export type FlowContext = {
  flowId: string;
  companyId: string;
  from?: string;
  recordCalls: boolean;
  transcribeCalls: boolean;
};

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

function inboundDialAttributes(
  recordCalls: boolean,
  attrs: Record<string, unknown>
) {
  return {
    ...attrs,
    ...(recordCalls
      ? {
          record: "record-from-answer-dual" as const,
          recordingStatusCallback: `${appBaseUrl()}/api/twilio/voice/recording`,
          recordingStatusCallbackMethod: "POST" as const,
        }
      : {}),
  };
}

/** Resolve a VoiceClip to a Twilio-playable URL (public clip endpoint). */
export async function resolveVoiceClipPlayUrl(
  clipId: string,
  companyId: string
): Promise<string | null> {
  const clip = await prisma.voiceClip.findFirst({
    where: { id: clipId, companyId },
  });
  if (!clip) return null;
  const proxied = blobProxyUrl(clip.blobUrl);
  if (!proxied) return null;
  return `${appBaseUrl()}/api/twilio/voice/clip?id=${clip.id}`;
}

export async function appendIvrPrompt(
  gather: ReturnType<twilio.twiml.VoiceResponse["gather"]>,
  config: IvrNodeConfig,
  companyId: string
) {
  if (config.promptClipId) {
    const playUrl = await resolveVoiceClipPlayUrl(config.promptClipId, companyId);
    if (playUrl) {
      gather.play(playUrl);
      return;
    }
  }
  gather.say(config.promptText ?? config.prompt ?? "Please make a selection.");
}

export function ivrGatherAction(flowId: string, nodeId: string) {
  return `${appBaseUrl()}/api/twilio/voice/ivr?flowId=${flowId}&nodeId=${nodeId}`;
}

/** Build TwiML for an IVR gather step (entry or nested IVR node). */
export async function renderIvrGather(
  response: twilio.twiml.VoiceResponse,
  node: CallFlowNode,
  ctx: FlowContext
) {
  const config = (node.config ?? {}) as IvrNodeConfig;
  const gather = response.gather({
    numDigits: 1,
    action: ivrGatherAction(ctx.flowId, node.id),
    method: "POST",
    timeout: 10,
  });
  await appendIvrPrompt(gather, config, ctx.companyId);
  response.say("We did not receive your input. Goodbye.");
}

/** Build TwiML for any call-flow node type. */
export async function renderIvrNode(
  node: CallFlowNode,
  nodes: CallFlowNode[],
  ctx: FlowContext
): Promise<string> {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();
  const config = (node.config ?? {}) as IvrNodeConfig;

  switch (node.type) {
    case CallFlowNodeType.IVR:
      await renderIvrGather(response, node, ctx);
      break;

    case CallFlowNodeType.DIAL_GROUP: {
      const group = config.groupId
        ? await prisma.agentGroup.findFirst({
            where: { id: config.groupId, companyId: ctx.companyId },
          })
        : await prisma.agentGroup.findFirst({ where: { companyId: ctx.companyId } });

      const dial = response.dial(
        inboundDialAttributes(ctx.recordCalls, {
          timeout: group?.ringTimeoutSec ?? 30,
          action: `${appBaseUrl()}/api/twilio/voice/dial-complete?companyId=${ctx.companyId}`,
          method: "POST",
          callerId: ctx.from,
        })
      );

      if (group) {
        await dialAgentGroup(dial, ctx.companyId, group.id, group.ringStrategy);
      } else {
        const identities = await getAvailableAgentIdentities(ctx.companyId);
        if (identities.length) {
          for (const identity of identities) {
            dial.client({}, identity);
          }
        } else {
          response.say("No agents are available. Please try again later.");
        }
      }
      break;
    }

    case CallFlowNodeType.DIAL_USER: {
      const targetUser = config.userId
        ? await prisma.user.findFirst({
            where: { id: config.userId, companyId: ctx.companyId },
            select: { id: true },
          })
        : null;

      if (!targetUser) {
        response.say("The person you are trying to reach is not available.");
        break;
      }

      const dial = response.dial(
        inboundDialAttributes(ctx.recordCalls, {
          timeout: config.timeoutSec ?? 30,
          action: `${appBaseUrl()}/api/twilio/voice/dial-complete?companyId=${ctx.companyId}`,
          method: "POST",
          callerId: ctx.from,
        })
      );

      // Rings every endpoint registered under this identity: the web softphone
      // and the user's iOS app (via VoIP push, even when the app is closed).
      dial.client({}, voiceClientIdentity(ctx.companyId, targetUser.id));
      break;
    }

    case CallFlowNodeType.QUEUE:
      response.enqueue(
        { waitUrl: `${appBaseUrl()}/api/twilio/voice/queue/wait` },
        `company_${ctx.companyId}`
      );
      break;

    case CallFlowNodeType.FORWARD:
      if (config.forwardTo) {
        response.dial({}, normalizePhone(config.forwardTo));
      } else {
        response.say("Forward destination not configured.");
      }
      break;

    case CallFlowNodeType.VOICEMAIL:
      response.say("Please leave a message after the tone.");
      response.record({
        maxLength: 120,
        recordingStatusCallback: `${appBaseUrl()}/api/twilio/voice/recording`,
        transcribe: ctx.transcribeCalls,
        transcribeCallback: ctx.transcribeCalls
          ? `${appBaseUrl()}/api/twilio/voice/transcription`
          : undefined,
      });
      break;

    case CallFlowNodeType.HANGUP:
      response.say("Goodbye.");
      response.hangup();
      break;

    default:
      response.say("This option is not available.");
  }

  return response.toString();
}

export async function renderIvrNodeById(
  nodeId: string,
  flowId: string,
  companyId: string,
  from?: string
): Promise<string | null> {
  const flow = await prisma.callFlow.findUnique({
    where: { id: flowId },
    include: { nodes: true },
  });
  if (!flow || flow.companyId !== companyId) return null;

  const node = flow.nodes.find((n) => n.id === nodeId);
  if (!node) return null;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { recordCalls: true, transcribeCalls: true },
  });

  return renderIvrNode(node, flow.nodes, {
    flowId,
    companyId,
    from,
    recordCalls: company?.recordCalls ?? true,
    transcribeCalls: company?.transcribeCalls ?? true,
  });
}

export function findNextIvrNode(
  current: CallFlowNode,
  nodes: CallFlowNode[],
  digits: string | undefined,
  reason: "digit" | "timeout" | "invalid"
): CallFlowNode | null {
  const config = (current.config ?? {}) as IvrNodeConfig;

  if (reason === "timeout" && config.timeoutNodeId) {
    return nodes.find((n) => n.id === config.timeoutNodeId) ?? null;
  }
  if (reason === "invalid" && config.invalidNodeId) {
    return nodes.find((n) => n.id === config.invalidNodeId) ?? null;
  }
  if (reason === "digit" && digits) {
    const match = config.options?.find((o) => o.digit === digits);
    if (match?.nextNodeId) {
      return nodes.find((n) => n.id === match.nextNodeId) ?? null;
    }
  }
  return null;
}
