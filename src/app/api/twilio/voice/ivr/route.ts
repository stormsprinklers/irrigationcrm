import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { prisma } from "@/lib/prisma";
import { parseTwilioWebhook } from "@/lib/voice/webhook";
import { buildInboundTwiml } from "@/lib/voice/routing";
import {
  clampIvrMaxNoInputAttempts,
  findNextIvrNode,
  renderIvrGather,
  renderIvrNoInputHangup,
  renderIvrNode,
  type FlowContext,
  type IvrNodeConfig,
} from "@/lib/voice/ivr";

export async function POST(request: NextRequest) {
  const params = await parseTwilioWebhook(request);
  if (!params) return NextResponse.json({ error: "Invalid signature" }, { status: 403 });

  const flowId = request.nextUrl.searchParams.get("flowId");
  const nodeId = request.nextUrl.searchParams.get("nodeId");
  const goto = request.nextUrl.searchParams.get("goto");
  const attemptRaw = Number(request.nextUrl.searchParams.get("attempt") ?? "0");
  const attempt = Number.isFinite(attemptRaw) ? Math.max(0, Math.floor(attemptRaw)) : 0;
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
    response.hangup();
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
    response.hangup();
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

  const config = (current.config ?? {}) as IvrNodeConfig;
  const maxAttempts = clampIvrMaxNoInputAttempts(config.maxNoInputAttempts);

  // No digit pressed within gather timeout — re-prompt or boot.
  if (!digits) {
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const response = new VoiceResponse();
    const nextAttempt = attempt + 1;
    if (nextAttempt < maxAttempts) {
      await renderIvrGather(response, current, ctx, nextAttempt);
      return new NextResponse(response.toString(), { headers: { "Content-Type": "text/xml" } });
    }
    const hangupTwiml = await renderIvrNoInputHangup(response, current, flow.nodes, ctx);
    return new NextResponse(hangupTwiml ?? response.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }

  const nextNode = findNextIvrNode(current, flow.nodes, digits, "digit");

  if (!nextNode) {
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const response = new VoiceResponse();
    const invalidFallback = findNextIvrNode(current, flow.nodes, digits, "invalid");
    if (invalidFallback) {
      const twiml = await renderIvrNode(invalidFallback, flow.nodes, ctx);
      return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
    }
    // Invalid digit: retry within the same attempt budget, then hang up.
    const nextAttempt = attempt + 1;
    if (nextAttempt < maxAttempts) {
      response.say("Invalid option.");
      await renderIvrGather(response, current, ctx, nextAttempt);
      return new NextResponse(response.toString(), { headers: { "Content-Type": "text/xml" } });
    }
    response.say("Invalid option. Goodbye.");
    response.hangup();
    return new NextResponse(response.toString(), { headers: { "Content-Type": "text/xml" } });
  }

  const twiml = await renderIvrNode(nextNode, flow.nodes, ctx);
  return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
}
