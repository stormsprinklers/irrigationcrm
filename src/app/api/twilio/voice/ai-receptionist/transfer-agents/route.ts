import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { AgentPresenceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseTwilioWebhook } from "@/lib/voice/webhook";
import { appBaseUrl, voiceClientIdentity } from "@/lib/voice/identity";

/**
 * Fallback human handoff when the AI node has no transferNodeId configured:
 * ring available CSR clients like the default inbound dial path.
 */
export async function POST(request: NextRequest) {
  const params = await parseTwilioWebhook(request);
  if (!params) return NextResponse.json({ error: "Invalid signature" }, { status: 403 });

  const companyId = request.nextUrl.searchParams.get("companyId");
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();

  if (!companyId) {
    response.say("I'm sorry, I could not reach an agent. Please try again later.");
    response.hangup();
    return new NextResponse(response.toString(), { headers: { "Content-Type": "text/xml" } });
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, recordCalls: true, name: true },
  });
  if (!company) {
    response.say("I'm sorry, I could not reach an agent.");
    response.hangup();
    return new NextResponse(response.toString(), { headers: { "Content-Type": "text/xml" } });
  }

  response.say("Please hold while I connect you with a team member.");

  const dial = response.dial({
    timeout: 30,
    action: `${appBaseUrl()}/api/twilio/voice/dial-complete?companyId=${company.id}`,
    method: "POST",
    callerId: params.From,
    ...(company.recordCalls
      ? {
          record: "record-from-answer-dual" as const,
          recordingStatusCallback: `${appBaseUrl()}/api/twilio/voice/recording`,
          recordingStatusCallbackMethod: "POST" as const,
        }
      : {}),
  });

  const presence = await prisma.agentPresence.findMany({
    where: { companyId: company.id, status: AgentPresenceStatus.AVAILABLE },
    select: { userId: true },
  });
  if (presence.length) {
    for (const row of presence) {
      dial.client({}, voiceClientIdentity(company.id, row.userId));
    }
  } else {
    response.say("No agents are available right now. Please leave a message after the tone.");
    response.redirect(
      { method: "POST" },
      `${appBaseUrl()}/api/twilio/voice/ai-receptionist/voicemail?companyId=${encodeURIComponent(company.id)}`
    );
  }

  return new NextResponse(response.toString(), { headers: { "Content-Type": "text/xml" } });
}
