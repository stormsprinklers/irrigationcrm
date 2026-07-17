import { NextRequest, NextResponse } from "next/server";
import { buildQueueWaitTwiml } from "@/lib/voice/routing";

/**
 * Twilio Enqueue waitUrl defaults to GET. Returning JSON/405 causes
 * "an application error has occurred" for the caller.
 */
async function waitMusic(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const twiml = await buildQueueWaitTwiml(companyId);
  return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
}

export async function GET(request: NextRequest) {
  return waitMusic(request);
}

export async function POST(request: NextRequest) {
  return waitMusic(request);
}
