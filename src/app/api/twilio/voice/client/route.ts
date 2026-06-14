import { NextRequest, NextResponse } from "next/server";
import { parseTwilioWebhook } from "@/lib/voice/webhook";
import { buildClientOutboundTwiml } from "@/lib/voice/routing";

export async function POST(request: NextRequest) {
  const params = await parseTwilioWebhook(request);
  if (!params) return NextResponse.json({ error: "Invalid signature" }, { status: 403 });

  const twiml = await buildClientOutboundTwiml(params);
  return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
}
