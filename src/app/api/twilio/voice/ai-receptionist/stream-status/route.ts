import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { ReceptionistCallStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseTwilioWebhook } from "@/lib/voice/webhook";
import { appBaseUrl } from "@/lib/voice/identity";

/**
 * Twilio Connect action when the Media Stream ends.
 * After a REST redirect (transfer/voicemail), Connect still hits this action —
 * we must continue the call, never hang up on TRANSFERRED/VOICEMAIL.
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

  const aiNode =
    flowId && nodeId
      ? await prisma.callFlowNode.findFirst({ where: { id: nodeId, flowId } })
      : null;
  const config = (aiNode?.config ?? {}) as {
    transferNodeId?: string;
    voicemailNodeId?: string;
  };

  if (callSid) {
    const existing = await prisma.receptionistCall.findUnique({
      where: { callSid },
      select: { status: true },
    });

    if (existing?.status === ReceptionistCallStatus.TRANSFERRED) {
      if (flowId && config.transferNodeId) {
        response.redirect(
          { method: "POST" },
          `${appBaseUrl()}/api/twilio/voice/ivr?flowId=${encodeURIComponent(flowId)}&goto=${encodeURIComponent(config.transferNodeId)}`
        );
      } else {
        // Transfer already redirected via REST; keep the call alive with a short pause.
        response.pause({ length: 1 });
      }
      return new NextResponse(response.toString(), {
        headers: { "Content-Type": "text/xml" },
      });
    }

    if (existing?.status === ReceptionistCallStatus.VOICEMAIL) {
      if (flowId && config.voicemailNodeId) {
        response.redirect(
          { method: "POST" },
          `${appBaseUrl()}/api/twilio/voice/ivr?flowId=${encodeURIComponent(flowId)}&goto=${encodeURIComponent(config.voicemailNodeId)}`
        );
      } else {
        const vmCompany = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
        response.redirect(
          { method: "POST" },
          `${appBaseUrl()}/api/twilio/voice/ai-receptionist/voicemail${vmCompany}`
        );
      }
      return new NextResponse(response.toString(), {
        headers: { "Content-Type": "text/xml" },
      });
    }

    if (existing?.status === ReceptionistCallStatus.COMPLETED) {
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

  if (flowId && config.voicemailNodeId) {
    response.redirect(
      { method: "POST" },
      `${appBaseUrl()}/api/twilio/voice/ivr?flowId=${encodeURIComponent(flowId)}&goto=${encodeURIComponent(config.voicemailNodeId)}`
    );
    return new NextResponse(response.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }

  const vmCompany = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
  response.redirect(
    { method: "POST" },
    `${appBaseUrl()}/api/twilio/voice/ai-receptionist/voicemail${vmCompany}`
  );
  return new NextResponse(response.toString(), { headers: { "Content-Type": "text/xml" } });
}
