import twilio from "twilio";
import { CallFlowNodeType, CallDirection, CallSessionStatus, Scope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appBaseUrl } from "@/lib/voice/identity";
import { resolveVoiceClipPlayUrl } from "@/lib/voice/ivr";

type GreetingConfig = {
  greetingText?: string;
  greetingClipId?: string | null;
  maxLengthSec?: number;
  transcribeCalls?: boolean;
};

async function resolveVoicemailGreeting(companyId: string): Promise<GreetingConfig> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { transcribeCalls: true },
  });

  const phoneWithFlow = await prisma.phoneNumber.findFirst({
    where: {
      companyId,
      callFlow: { is: { nodes: { some: { type: CallFlowNodeType.VOICEMAIL } } } },
    },
    include: {
      callFlow: {
        include: {
          nodes: { where: { type: CallFlowNodeType.VOICEMAIL }, take: 1 },
        },
      },
    },
  });

  const node = phoneWithFlow?.callFlow?.nodes[0];
  const config = (node?.config ?? {}) as {
    greetingText?: string;
    greetingClipId?: string;
    maxLengthSec?: number;
  };

  return {
    greetingText:
      config.greetingText?.trim() ||
      "We are sorry we missed your call. Please leave a message after the tone, and we will get back to you as soon as possible.",
    greetingClipId: config.greetingClipId ?? null,
    maxLengthSec: config.maxLengthSec ?? 120,
    transcribeCalls: company?.transcribeCalls ?? true,
  };
}

/**
 * TwiML for unanswered inbound calls: greeting + record + thank-you.
 */
export async function buildVoicemailTwiml(companyId: string): Promise<string> {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();
  const greeting = await resolveVoicemailGreeting(companyId);

  if (greeting.greetingClipId) {
    const url = await resolveVoiceClipPlayUrl(greeting.greetingClipId, companyId);
    if (url) {
      response.play(url);
    } else {
      response.say(greeting.greetingText || "Please leave a message after the tone.");
    }
  } else {
    response.say(greeting.greetingText || "Please leave a message after the tone.");
  }

  response.record({
    maxLength: greeting.maxLengthSec ?? 120,
    playBeep: true,
    timeout: 5,
    action: `${appBaseUrl()}/api/twilio/voice/voicemail/complete?companyId=${companyId}`,
    method: "POST",
    recordingStatusCallback: `${appBaseUrl()}/api/twilio/voice/recording`,
    recordingStatusCallbackMethod: "POST",
    transcribe: greeting.transcribeCalls,
    transcribeCallback: greeting.transcribeCalls
      ? `${appBaseUrl()}/api/twilio/voice/transcription`
      : undefined,
  });

  response.say("We did not receive a message. Goodbye.");
  response.hangup();
  return response.toString();
}

/** Ensure a CallLog exists for an unanswered inbound call that reached voicemail. */
export async function ensureVoicemailCallLog(input: {
  companyId: string;
  callSid: string;
  from?: string;
  to?: string;
}) {
  const session = await prisma.callSession.findFirst({
    where: { callSid: input.callSid, companyId: input.companyId },
  });

  await prisma.callSession.updateMany({
    where: { callSid: input.callSid, companyId: input.companyId },
    data: {
      status: CallSessionStatus.COMPLETED,
      endedAt: new Date(),
    },
  });

  const existing = await prisma.callLog.findFirst({
    where: {
      companyId: input.companyId,
      OR: [
        { twilioCallSid: input.callSid },
        ...(session ? [{ sessionId: session.id }] : []),
      ],
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.callLog.update({
      where: { id: existing.id },
      data: {
        status: "no-answer",
        dispositionNote: "Voicemail",
        endedAt: new Date(),
      },
    });
    return existing.id;
  }

  const created = await prisma.callLog.create({
    data: {
      companyId: input.companyId,
      scope: Scope.EXTERNAL,
      direction: CallDirection.INBOUND,
      fromNumber: input.from || session?.fromNumber || "unknown",
      toNumber: input.to || session?.toNumber || "unknown",
      customerId: session?.customerId ?? null,
      sessionId: session?.id ?? null,
      phoneNumberId: session?.phoneNumberId ?? null,
      twilioCallSid: input.callSid,
      status: "no-answer",
      dispositionNote: "Voicemail",
      endedAt: new Date(),
    },
  });
  return created.id;
}
