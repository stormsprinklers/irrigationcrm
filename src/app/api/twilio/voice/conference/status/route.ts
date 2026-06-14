import { NextRequest, NextResponse } from "next/server";
import { CallSessionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseTwilioWebhook } from "@/lib/voice/webhook";

export async function POST(request: NextRequest) {
  const params = await parseTwilioWebhook(request);
  if (!params) return NextResponse.json({ error: "Invalid signature" }, { status: 403 });

  const conferenceSid = params.ConferenceSid;
  const event = params.StatusCallbackEvent;

  if (conferenceSid && event === "conference-end") {
    await prisma.callSession.updateMany({
      where: { conferenceSid },
      data: { status: CallSessionStatus.COMPLETED, endedAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true });
}
