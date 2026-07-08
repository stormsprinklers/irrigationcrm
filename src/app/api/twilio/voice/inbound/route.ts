import { NextRequest, NextResponse } from "next/server";
import { parseTwilioWebhook } from "@/lib/voice/webhook";
import { buildInboundTwiml } from "@/lib/voice/routing";
import { twimlSayAndHangup } from "@/lib/voice/twiml-response";

export async function POST(request: NextRequest) {
  try {
    const params = await parseTwilioWebhook(request);
    if (!params) {
      return twimlSayAndHangup("Unable to connect your call.");
    }

    const twiml = await buildInboundTwiml(params);
    return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
  } catch (error) {
    console.error("[twilio/voice/inbound]", error);
    return twimlSayAndHangup("We could not complete your call. Please try again.");
  }
}
