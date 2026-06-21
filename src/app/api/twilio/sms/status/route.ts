import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseTwilioWebhook } from "@/lib/voice/webhook";

const STATUS_MAP: Record<string, string> = {
  queued: "queued",
  sending: "sending",
  sent: "sent",
  delivered: "delivered",
  undelivered: "undelivered",
  failed: "failed",
  receiving: "receiving",
  received: "received",
};

export async function POST(request: NextRequest) {
  const params = await parseTwilioWebhook(request);
  if (!params) return NextResponse.json({ error: "Invalid signature" }, { status: 403 });

  const messageSid = params.MessageSid;
  const messageStatus = params.MessageStatus?.toLowerCase();

  if (!messageSid || !messageStatus) {
    return NextResponse.json({ ok: true });
  }

  const deliveryStatus = STATUS_MAP[messageStatus] ?? messageStatus;

  await prisma.message.updateMany({
    where: { twilioMessageSid: messageSid },
    data: { deliveryStatus },
  });

  return NextResponse.json({ ok: true });
}
