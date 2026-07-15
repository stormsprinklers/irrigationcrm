import { NextRequest, NextResponse } from "next/server";
import { parseTwilioWebhook } from "@/lib/voice/webhook";
import { twimlHangup, twimlResponse } from "@/lib/voice/twiml-response";

/**
 * After &lt;Record&gt; finishes (or caller hangs up mid-message).
 * Always return valid TwiML — never JSON.
 */
export async function POST(request: NextRequest) {
  try {
    const params = await parseTwilioWebhook(request);
    if (!params) {
      return twimlHangup();
    }

    const digits = (params.Digits ?? "").trim();
    // Hangup during record often still hits action URL.
    if (params.RecordingUrl || params.RecordingSid) {
      return twimlResponse(
        "<Response><Say>Thank you for your message. Goodbye.</Say><Hangup/></Response>"
      );
    }

    if (digits === "hangup" || !params.RecordingUrl) {
      return twimlResponse(
        "<Response><Say>We did not receive a message. Goodbye.</Say><Hangup/></Response>"
      );
    }

    return twimlResponse(
      "<Response><Say>Thank you for your message. Goodbye.</Say><Hangup/></Response>"
    );
  } catch (error) {
    console.error("[twilio/voice/voicemail/complete]", error);
    return twimlHangup();
  }
}

export async function GET() {
  // Twilio should POST; keep a safe fallback.
  return new NextResponse(
    "<Response><Say>Thank you. Goodbye.</Say><Hangup/></Response>",
    { headers: { "Content-Type": "text/xml" } }
  );
}
