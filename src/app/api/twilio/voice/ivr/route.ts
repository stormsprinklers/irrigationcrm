import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { prisma } from "@/lib/prisma";
import { parseTwilioWebhook } from "@/lib/voice/webhook";
import { buildInboundTwiml } from "@/lib/voice/routing";
import {
  findNextIvrNode,
  renderIvrNode,
  type FlowContext,
} from "@/lib/voice/ivr";

export async function POST(request: NextRequest) {
  const params = await parseTwilioWebhook(request);
  if (!params) return NextResponse.json({ error: "Invalid signature" }, { status: 403 });

  const flowId = request.nextUrl.searchParams.get("flowId");
  const nodeId = request.nextUrl.searchParams.get("nodeId");
  const goto = request.nextUrl.searchParams.get("goto");
  const digits = params.Digits;

  if (!flowId || (!nodeId && !goto)) {
    const twiml = await buildInboundTwiml(params);
    return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
  }

  const flow = await prisma.callFlow.findUnique({
    where: { id: flowId },
    include: { nodes: true },
  });
  if (!flow) {
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const response = new VoiceResponse();
    response.say("Call flow not found. Goodbye.");
    return new NextResponse(response.toString(), { headers: { "Content-Type": "text/xml" } });
  }

  // Pass-through steps (e.g. PLAY) redirect here with ?goto=<nextNodeId> to continue the flow.
  if (goto) {
    const company = await prisma.company.findUnique({
      where: { id: flow.companyId },
      select: { recordCalls: true, transcribeCalls: true },
    });
    const target = flow.nodes.find((n) => n.id === goto);
    const VoiceResponse = twilio.twiml.VoiceResponse;
    if (!target) {
      const response = new VoiceResponse();
      response.hangup();
      return new NextResponse(response.toString(), { headers: { "Content-Type": "text/xml" } });
    }
    const twiml = await renderIvrNode(target, flow.nodes, {
      flowId: flow.id,
      companyId: flow.companyId,
      from: params.From,
      to: params.To,
      callSid: params.CallSid,
      recordCalls: company?.recordCalls ?? true,
      transcribeCalls: company?.transcribeCalls ?? true,
    });
    return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
  }

  const current = flow.nodes.find((n) => n.id === nodeId);
  if (!current) {
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const response = new VoiceResponse();
    response.say("Invalid menu. Goodbye.");
    return new NextResponse(response.toString(), { headers: { "Content-Type": "text/xml" } });
  }

  const company = await prisma.company.findUnique({
    where: { id: flow.companyId },
    select: { recordCalls: true, transcribeCalls: true },
  });

  const ctx: FlowContext = {
    flowId: flow.id,
    companyId: flow.companyId,
    from: params.From,
    to: params.To,
    callSid: params.CallSid,
    recordCalls: company?.recordCalls ?? true,
    transcribeCalls: company?.transcribeCalls ?? true,
  };

  const reason = digits ? "digit" : "timeout";
  const nextNode = findNextIvrNode(current, flow.nodes, digits, reason);

  if (!nextNode) {
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const response = new VoiceResponse();
    if (!digits) {
      const fallback = findNextIvrNode(current, flow.nodes, undefined, "timeout");
      if (fallback) {
        const twiml = await renderIvrNode(fallback, flow.nodes, ctx);
        return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
      }
      response.say("We did not receive your input. Goodbye.");
    } else {
      const invalidFallback = findNextIvrNode(current, flow.nodes, digits, "invalid");
      if (invalidFallback) {
        const twiml = await renderIvrNode(invalidFallback, flow.nodes, ctx);
        return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
      }
      response.say("Invalid option. Goodbye.");
    }
    return new NextResponse(response.toString(), { headers: { "Content-Type": "text/xml" } });
  }

  const twiml = await renderIvrNode(nextNode, flow.nodes, ctx);
  return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
}
