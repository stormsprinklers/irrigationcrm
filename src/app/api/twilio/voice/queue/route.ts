import { NextRequest, NextResponse } from "next/server";
import { CallSessionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseTwilioWebhook } from "@/lib/voice/webhook";
import { buildQueueTwiml } from "@/lib/voice/routing";

export async function POST(request: NextRequest) {
  const params = await parseTwilioWebhook(request);
  if (!params) return NextResponse.json({ error: "Invalid signature" }, { status: 403 });

  const companyId = request.nextUrl.searchParams.get("companyId");
  if (!companyId) {
    return new NextResponse("<Response><Say>Goodbye</Say></Response>", {
      headers: { "Content-Type": "text/xml" },
    });
  }

  if (params.CallSid) {
    await prisma.callSession.updateMany({
      where: { callSid: params.CallSid, companyId },
      data: {
        status: CallSessionStatus.RINGING,
        queueEnteredAt: new Date(),
      },
    });
  }

  const twiml = await buildQueueTwiml(companyId);
  return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
}
