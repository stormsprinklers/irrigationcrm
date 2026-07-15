import { NextResponse } from "next/server";
import { buildQueueWaitTwiml } from "@/lib/voice/routing";

/**
 * Twilio Enqueue waitUrl defaults to GET. Returning JSON/405 causes
 * "an application error has occurred" for the caller.
 */
async function waitMusic() {
  const twiml = await buildQueueWaitTwiml();
  return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
}

export async function GET() {
  return waitMusic();
}

export async function POST() {
  return waitMusic();
}
