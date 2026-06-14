import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { parseTwilioWebhook } from "@/lib/voice/webhook";
import { voiceClientIdentity } from "@/lib/voice/identity";

export async function POST(request: NextRequest) {
  const params = await parseTwilioWebhook(request);
  if (!params) return NextResponse.json({ error: "Invalid signature" }, { status: 403 });

  const companyId = request.nextUrl.searchParams.get("companyId");
  const userId = request.nextUrl.searchParams.get("userId");
  if (!companyId || !userId) {
    return new NextResponse("<Response><Say>Unable to connect.</Say></Response>", {
      headers: { "Content-Type": "text/xml" },
    });
  }

  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();
  const identity = voiceClientIdentity(companyId, userId);
  const dial = response.dial();
  dial.client({}, identity);

  return new NextResponse(response.toString(), { headers: { "Content-Type": "text/xml" } });
}
