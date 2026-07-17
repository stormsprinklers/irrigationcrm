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
import {
  createStreamToken,
  getSidebandPublicWssUrl,
  isAiReceptionistConfigured,
} from "@/lib/ai-receptionist/auth";
import { appBaseUrl, voiceClientIdentity } from "./identity";
import { getAvailableAgentIdentities, getNextRoundRobinAgent } from "./presence";
import { resolveHoursBranchNextNodeId, type HoursBranchConfig } from "./hours-branch";

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
  /** PLAY step: audio clip to play, with typed text as a text-to-speech fallback. */
  clipId?: string;
  text?: string;
  /** VOICEMAIL step: greeting played before recording. */
  greetingClipId?: string;
  greetingText?: string;
  maxLengthSec?: number;
  /** QUEUE: digit to leave queue and go to voicemail (e.g. "1" or "*"). */
  voicemailDigit?: string;
  /** QUEUE: optional VOICEMAIL (or other) node after leaving the queue. */
  voicemailNodeId?: string;
  /** AI_RECEPTIONIST */
  voice?: string;
  transferNodeId?: string;
  allowedTools?: string[];
  maxCallMinutes?: number;
  discloseScript?: string;
  /** HOURS_BRANCH: schedule windows → next steps (see hours-branch.ts). */
  rules?: Array<{
    id: string;
    label: string;
    days: number[];
    start: string;
    end: string;
    nextNodeId: string;
  }>;
  defaultNextNodeId?: string;
};

function flowNodeBranch(config: unknown): "open" | "closed" {
  const branch = (config as { branch?: string } | null)?.branch;
  return branch === "closed" ? "closed" : "open";
}

/** The next step to run when a pass-through step (e.g. PLAY) finishes. */
function findNextSequentialNode(
  current: CallFlowNode,
  nodes: CallFlowNode[]
): CallFlowNode | null {
  const branch = flowNodeBranch(current.config);
  const later = nodes
    .filter(
      (n) => n.sortOrder > current.sortOrder && flowNodeBranch(n.config) === branch
    )
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return later[0] ?? null;
}

/** Play an audio clip when configured, otherwise speak the fallback text. */
async function appendAudio(
  target: {
    play: (url: string) => void;
    say: (text: string) => void;
  },
  clipId: string | undefined,
  text: string | undefined,
  fallbackText: string,
  companyId: string
) {
  if (clipId) {
    const playUrl = await resolveVoiceClipPlayUrl(clipId, companyId);
    if (playUrl) {
      target.play(playUrl);
      return;
    }
  }
  target.say(text?.trim() || fallbackText);
}

export type FlowContext = {
  flowId: string;
  companyId: string;
  from?: string;
  to?: string;
  callSid?: string;
  callSessionId?: string;
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

    case CallFlowNodeType.QUEUE: {
      const waitParams = new URLSearchParams({
        companyId: ctx.companyId,
        flowId: ctx.flowId,
        nodeId: node.id,
      });
      // Use Enqueue action so we only run voicemail when QueueResult=leave
      // (caller pressed the escape key). Agent answer / hangup must not fall through.
      const actionParams = new URLSearchParams({ companyId: ctx.companyId });
      if (config.voicemailDigit) {
        if (config.voicemailNodeId) {
          actionParams.set("flowId", ctx.flowId);
          actionParams.set("nodeId", config.voicemailNodeId);
        }
        response.enqueue(
          {
            waitUrl: `${appBaseUrl()}/api/twilio/voice/queue/wait?${waitParams.toString()}`,
            action: `${appBaseUrl()}/api/twilio/voice/queue/voicemail?${actionParams.toString()}`,
            method: "POST",
          },
          `company_${ctx.companyId}`
        );
      } else {
        response.enqueue(
          {
            waitUrl: `${appBaseUrl()}/api/twilio/voice/queue/wait?${waitParams.toString()}`,
          },
          `company_${ctx.companyId}`
        );
      }
      break;
    }

    case CallFlowNodeType.HOURS_BRANCH: {
      const company = await prisma.company.findUnique({
        where: { id: ctx.companyId },
        select: { timezone: true },
      });
      const nextId = resolveHoursBranchNextNodeId(
        config as HoursBranchConfig,
        company?.timezone
      );
      const next = nextId ? nodes.find((n) => n.id === nextId) : null;
      if (next) {
        response.redirect(
          { method: "POST" },
          `${appBaseUrl()}/api/twilio/voice/ivr?flowId=${ctx.flowId}&goto=${next.id}`
        );
      } else {
        response.say("We are closed right now. Please try again during business hours.");
        response.hangup();
      }
      break;
    }

    case CallFlowNodeType.FORWARD:
      if (config.forwardTo) {
        response.dial({}, normalizePhone(config.forwardTo));
      } else {
        response.say("Forward destination not configured.");
      }
      break;

    case CallFlowNodeType.VOICEMAIL:
      await appendAudio(
        response,
        config.greetingClipId,
        config.greetingText,
        "Please leave a message after the tone.",
        ctx.companyId
      );
      response.record({
        maxLength: config.maxLengthSec ?? 120,
        recordingStatusCallback: `${appBaseUrl()}/api/twilio/voice/recording`,
        transcribe: ctx.transcribeCalls,
        transcribeCallback: ctx.transcribeCalls
          ? `${appBaseUrl()}/api/twilio/voice/transcription`
          : undefined,
      });
      break;

    case CallFlowNodeType.PLAY: {
      await appendAudio(
        response,
        config.clipId,
        config.text,
        "Thank you for calling.",
        ctx.companyId
      );
      const next = findNextSequentialNode(node, nodes);
      if (next) {
        response.redirect(
          { method: "POST" },
          `${appBaseUrl()}/api/twilio/voice/ivr?flowId=${ctx.flowId}&goto=${next.id}`
        );
      } else {
        response.hangup();
      }
      break;
    }

    case CallFlowNodeType.HANGUP:
      response.say("Goodbye.");
      response.hangup();
      break;

    case CallFlowNodeType.AI_RECEPTIONIST: {
      await renderAiReceptionistNode(response, node, nodes, ctx, config);
      break;
    }

    default:
      response.say("This option is not available.");
  }

  return response.toString();
}

async function renderAiReceptionistNode(
  response: InstanceType<typeof twilio.twiml.VoiceResponse>,
  node: CallFlowNode,
  nodes: CallFlowNode[],
  ctx: FlowContext,
  config: IvrNodeConfig
) {
  const company = await prisma.company.findUnique({
    where: { id: ctx.companyId },
    select: { aiReceptionistEnabled: true, name: true },
  });

  const voicemailNode =
    (config.voicemailNodeId
      ? nodes.find((n) => n.id === config.voicemailNodeId)
      : null) ??
    nodes.find((n) => n.type === CallFlowNodeType.VOICEMAIL) ??
    null;

  const fallbackUrl = voicemailNode
    ? `${appBaseUrl()}/api/twilio/voice/ivr?flowId=${ctx.flowId}&goto=${voicemailNode.id}`
    : `${appBaseUrl()}/api/twilio/voice/ai-receptionist/voicemail?companyId=${ctx.companyId}`;

  if (
    !company?.aiReceptionistEnabled ||
    !isAiReceptionistConfigured() ||
    !ctx.callSid ||
    !ctx.from
  ) {
    console.warn("[ai-receptionist] soft-fail to voicemail", {
      companyId: ctx.companyId,
      callSid: ctx.callSid,
      enabled: company?.aiReceptionistEnabled ?? false,
      configured: isAiReceptionistConfigured(),
      hasFrom: Boolean(ctx.from),
      sideband: getSidebandPublicWssUrl() || null,
    });
    response.say(
      "Our automated receptionist is temporarily unavailable. Please leave a message after the tone."
    );
    response.redirect({ method: "POST" }, fallbackUrl);
    return;
  }

  const sidebandUrl = getSidebandPublicWssUrl();
  const token = createStreamToken({
    companyId: ctx.companyId,
    callSid: ctx.callSid,
    flowId: ctx.flowId,
    nodeId: node.id,
    from: ctx.from,
    to: ctx.to,
    callSessionId: ctx.callSessionId,
  });

  // Brief cue so a fast stream failure is distinguishable from a bare voicemail entry.
  response.say("One moment while I connect you.");

  const connect = response.connect({
    action: `${appBaseUrl()}/api/twilio/voice/ai-receptionist/stream-status?companyId=${encodeURIComponent(ctx.companyId)}&flowId=${encodeURIComponent(ctx.flowId)}&nodeId=${encodeURIComponent(node.id)}`,
    method: "POST",
  });
  const stream = connect.stream({ url: sidebandUrl });
  stream.parameter({ name: "token", value: token });
  stream.parameter({ name: "companyId", value: ctx.companyId });
  stream.parameter({ name: "callSid", value: ctx.callSid });
  stream.parameter({ name: "flowId", value: ctx.flowId });
  stream.parameter({ name: "nodeId", value: node.id });
  stream.parameter({ name: "from", value: ctx.from });
  if (ctx.to) stream.parameter({ name: "to", value: ctx.to });
  if (ctx.callSessionId) {
    stream.parameter({ name: "callSessionId", value: ctx.callSessionId });
  }
  // Do not add verbs after <Connect> when action is set — Twilio continues via action.
}

export async function renderIvrNodeById(
  nodeId: string,
  flowId: string,
  companyId: string,
  from?: string,
  extras?: { to?: string; callSid?: string; callSessionId?: string }
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
    to: extras?.to,
    callSid: extras?.callSid,
    callSessionId: extras?.callSessionId,
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
