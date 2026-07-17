import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { prisma } from "@/lib/prisma";
import { parseTwilioWebhook } from "@/lib/voice/webhook";
import { appBaseUrl } from "@/lib/voice/identity";

/** After Media Stream Connect ends without a REST redirect, land in voicemail. */
export async function POST(request: NextRequest) {
  const params = await parseTwilioWebhook(request);
  if (!params) return NextResponse.json({ error: "Invalid signature" }, { status: 403 });

  const companyId =
    request.nextUrl.searchParams.get("companyId") ??
    (await resolveCompanyId(params.To));

  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();

  if (!companyId) {
    response.say("Please leave a message after the tone.");
    response.record({
      maxLength: 120,
      recordingStatusCallback: `${appBaseUrl()}/api/twilio/voice/recording`,
    });
    return new NextResponse(response.toString(), { headers: { "Content-Type": "text/xml" } });
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { recordCalls: true, transcribeCalls: true, name: true },
  });

  response.say(
    `Thank you for calling ${company?.name ?? "us"}. Please leave a message after the tone.`
  );
  response.record({
    maxLength: 120,
    recordingStatusCallback: `${appBaseUrl()}/api/twilio/voice/recording`,
    transcribe: company?.transcribeCalls ?? false,
    transcribeCallback: company?.transcribeCalls
      ? `${appBaseUrl()}/api/twilio/voice/transcription`
      : undefined,
  });

  return new NextResponse(response.toString(), { headers: { "Content-Type": "text/xml" } });
}

async function resolveCompanyId(to: string | undefined) {
  if (!to) return null;
  const { normalizePhone } = await import("@/lib/inbox/contacts");
  const phone = await prisma.phoneNumber.findFirst({
    where: { e164: normalizePhone(to) },
    select: { companyId: true },
  });
  return phone?.companyId ?? null;
}
