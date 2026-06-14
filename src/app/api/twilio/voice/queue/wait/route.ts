import { NextResponse } from "next/server";
import { buildQueueWaitTwiml } from "@/lib/voice/routing";

export async function POST() {
  const twiml = await buildQueueWaitTwiml();
  return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
}
