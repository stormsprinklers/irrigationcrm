import { NextRequest, NextResponse } from "next/server";
import { CallFlowNodeType } from "@prisma/client";
import twilio from "twilio";
import { prisma } from "@/lib/prisma";
import { parseTwilioWebhook } from "@/lib/voice/webhook";
import { appBaseUrl } from "@/lib/voice/identity";
import { buildInboundTwiml } from "@/lib/voice/routing";

export async function POST(request: NextRequest) {
  const params = await parseTwilioWebhook(request);
  if (!params) return NextResponse.json({ error: "Invalid signature" }, { status: 403 });

  const flowId = request.nextUrl.searchParams.get("flowId");
  const nodeId = request.nextUrl.searchParams.get("nodeId");
  const digits = params.Digits;

  if (!flowId || !nodeId) {
    const twiml = await buildInboundTwiml(params);
    return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
  }

  const flow = await prisma.callFlow.findUnique({
    where: { id: flowId },
    include: { nodes: true },
  });
  const current = flow?.nodes.find((n) => n.id === nodeId);
  const config = (current?.config ?? {}) as {
    options?: Array<{ digit: string; nextNodeId?: string; label?: string }>;
  };

  const match = config.options?.find((o) => o.digit === digits);
  const nextNode = match?.nextNodeId
    ? flow?.nodes.find((n) => n.id === match.nextNodeId)
    : null;

  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();

  if (nextNode?.type === CallFlowNodeType.DIAL_GROUP && flow) {
    const nodeConfig = nextNode.config as { groupId?: string };
    const group = nodeConfig.groupId
      ? await prisma.agentGroup.findFirst({ where: { id: nodeConfig.groupId, companyId: flow.companyId } })
      : await prisma.agentGroup.findFirst({ where: { companyId: flow.companyId } });

    const dial = response.dial({
      timeout: group?.ringTimeoutSec ?? 30,
      action: `${appBaseUrl()}/api/twilio/voice/queue?companyId=${flow.companyId}`,
      method: "POST",
    });

    if (group) {
      const { getAvailableAgentIdentities } = await import("@/lib/voice/presence");
      const identities = await getAvailableAgentIdentities(flow.companyId);
      for (const identity of identities) {
        dial.client({}, identity);
      }
    }
  } else if (nextNode?.type === CallFlowNodeType.VOICEMAIL) {
    response.say("Please leave a message after the tone.");
    response.record({ maxLength: 120 });
  } else {
    response.say("Invalid option. Goodbye.");
  }

  return new NextResponse(response.toString(), { headers: { "Content-Type": "text/xml" } });
}
