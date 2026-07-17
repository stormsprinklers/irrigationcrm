import { NextRequest, NextResponse } from "next/server";
import { buildQueueWaitTwiml } from "@/lib/voice/routing";

/**
 * Twilio Enqueue waitUrl — play queue music, optionally gather a voicemail escape digit.
 */
async function waitMusic(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const flowId = request.nextUrl.searchParams.get("flowId");
  const nodeId = request.nextUrl.searchParams.get("nodeId");

  let digits: string | null = request.nextUrl.searchParams.get("Digits");
  if (request.method === "POST") {
    try {
      const formData = await request.formData();
      const fromForm = formData.get("Digits");
      if (fromForm != null) digits = String(fromForm);
    } catch {
      // fall through
    }
  }

  const twiml = await buildQueueWaitTwiml({
    companyId,
    flowId,
    nodeId,
    digits,
  });
  return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
}

export async function GET(request: NextRequest) {
  return waitMusic(request);
}

export async function POST(request: NextRequest) {
  return waitMusic(request);
}
