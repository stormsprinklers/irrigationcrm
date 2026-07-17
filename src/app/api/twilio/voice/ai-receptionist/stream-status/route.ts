import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { ReceptionistCallStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseTwilioWebhook } from "@/lib/voice/webhook";
import { appBaseUrl } from "@/lib/voice/identity";

/**
 * Twilio Connect action when the Media Stream ends.
 * If the call was already transferred/voicemail via REST, this is a no-op hangup.
 * Otherwise redirect to configured voicemail.
 */
export async function POST(request: NextRequest) {
  const params = await parseTwilioWebhook(request);
  if (!params) return NextResponse.json({ error: "Invalid signature" }, { status: 403 });

  const companyId = request.nextUrl.searchParams.get("companyId");
  const flowId = request.nextUrl.searchParams.get("flowId");
  const nodeId = request.nextUrl.searchParams.get("nodeId");
  const callSid = params.CallSid;

  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();

  if (callSid) {
    const existing = await prisma.receptionistCall.findUnique({
      where: { callSid },
      select: { status: true },
    });
    if (
      existing &&
      (existing.status === ReceptionistCallStatus.TRANSFERRED ||
        existing.status === ReceptionistCallStatus.VOICEMAIL ||
        existing.status === ReceptionistCallStatus.COMPLETED)
    ) {
      response.hangup();
      return new NextResponse(response.toString(), {
        headers: { "Content-Type": "text/xml" },
      });
    }

    await prisma.receptionistCall.updateMany({
      where: { callSid, status: ReceptionistCallStatus.ACTIVE },
      data: {
        status: ReceptionistCallStatus.VOICEMAIL,
        endedAt: new Date(),
        failureReason: "stream_ended",
      },
    });
  }

  if (flowId && nodeId) {
    const node = await prisma.callFlowNode.findFirst({ where: { id: nodeId, flowId } });
    const config = (node?.config ?? {}) as { voicemailNodeId?: string };
    if (config.voicemailNodeId) {
      response.redirect(
        { method: "POST" },
        `${appBaseUrl()}/api/twilio/voice/ivr?flowId=${encodeURIComponent(flowId)}&goto=${encodeURIComponent(config.voicemailNodeId)}`
      );
      return new NextResponse(response.toString(), {
        headers: { "Content-Type": "text/xml" },
      });
    }
  }

  const vmCompany = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
  response.redirect(
    { method: "POST" },
    `${appBaseUrl()}/api/twilio/voice/ai-receptionist/voicemail${vmCompany}`
  );
  return new NextResponse(response.toString(), { headers: { "Content-Type": "text/xml" } });
}
