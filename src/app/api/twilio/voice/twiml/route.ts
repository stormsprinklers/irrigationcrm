import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { validateTwilioSignature } from "@/lib/inbox/twilio";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    params[key] = String(value);
  });

  const signature = request.headers.get("x-twilio-signature") ?? "";
  const url = request.url;

  if (process.env.TWILIO_AUTH_TOKEN && !validateTwilioSignature(signature, url, params)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const to = request.nextUrl.searchParams.get("to") ?? params.To;
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();

  if (to) {
    response.dial(
      {
        record: "record-from-answer",
        recordingStatusCallback: `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/voice/recording`,
      },
      to
    );
  } else {
    response.say("No destination number provided.");
  }

  return new NextResponse(response.toString(), {
    headers: { "Content-Type": "text/xml" },
  });
}
