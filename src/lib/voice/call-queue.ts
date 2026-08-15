import { AgentPresenceStatus, CallSessionStatus } from "@prisma/client";
import twilio from "twilio";
import { prisma } from "@/lib/prisma";
import { appBaseUrl } from "@/lib/voice/identity";
import { getAvailableAgentIdentities } from "@/lib/voice/presence";

export async function markCallSessionQueued(companyId: string, callSid?: string | null) {
  if (!callSid) return;
  await prisma.callSession.updateMany({
    where: { companyId, callSid },
    data: {
      queueEnteredAt: new Date(),
      status: CallSessionStatus.RINGING,
    },
  });
}

export function appendCompanyQueueEnqueue(
  response: InstanceType<typeof twilio.twiml.VoiceResponse>,
  companyId: string,
  opts?: { flowId?: string; nodeId?: string }
) {
  const waitParams = new URLSearchParams({ companyId });
  if (opts?.flowId) waitParams.set("flowId", opts.flowId);
  if (opts?.nodeId) waitParams.set("nodeId", opts.nodeId);
  response.enqueue(
    {
      waitUrl: `${appBaseUrl()}/api/twilio/voice/queue/wait?${waitParams.toString()}`,
    },
    `company_${companyId}`
  );
}

export async function enqueueCallerBecauseAgentsBusyTwiml(
  companyId: string,
  callSid?: string | null,
  opts?: { flowId?: string; nodeId?: string }
) {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();
  await markCallSessionQueued(companyId, callSid);
  response.say("All agents are currently on another call. Please hold.");
  appendCompanyQueueEnqueue(response, companyId, opts);
  return response.toString();
}

export async function isUserOnCall(userId: string) {
  const presence = await prisma.agentPresence.findUnique({
    where: { userId },
    select: { status: true },
  });
  return presence?.status === AgentPresenceStatus.ON_CALL;
}

export async function shouldQueueBecauseAgentsBusy(
  companyId: string,
  options?: { userId?: string; groupId?: string }
) {
  if (options?.userId) {
    return isUserOnCall(options.userId);
  }

  let memberIds: string[] | undefined;
  if (options?.groupId) {
    const group = await prisma.agentGroup.findFirst({
      where: { id: options.groupId, companyId },
      select: { members: { select: { userId: true } } },
    });
    memberIds = group?.members.map((m) => m.userId);
  }

  const available = await getAvailableAgentIdentities(companyId);
  const availableUserIds = available.map((id) => id.split("_").slice(1).join("_"));
  const availableInScope = memberIds?.length
    ? availableUserIds.filter((id) => memberIds!.includes(id))
    : availableUserIds;
  if (availableInScope.length > 0) return false;

  const onCall = await prisma.agentPresence.count({
    where: {
      companyId,
      status: AgentPresenceStatus.ON_CALL,
      ...(memberIds?.length ? { userId: { in: memberIds } } : {}),
    },
  });
  return onCall > 0;
}

export async function companyHasAgentsOnCall(companyId: string) {
  const count = await prisma.agentPresence.count({
    where: { companyId, status: AgentPresenceStatus.ON_CALL },
  });
  return count > 0;
}
