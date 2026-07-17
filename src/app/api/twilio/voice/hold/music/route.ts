import { NextRequest, NextResponse } from "next/server";
import { buildHoldMusicTwiml } from "@/lib/voice/routing";

/** Twilio conference participant holdUrl — plays company hold music on loop. */
async function holdMusic(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const twiml = await buildHoldMusicTwiml(companyId);
  return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
}

export async function GET(request: NextRequest) {
  return holdMusic(request);
}

export async function POST(request: NextRequest) {
  return holdMusic(request);
}
