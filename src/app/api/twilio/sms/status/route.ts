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

  if (messageStatus === "delivered" || messageStatus === "failed" || messageStatus === "undelivered") {
    const recipientStatus = messageStatus === "delivered" ? "delivered" : "failed";
    const recipient = await prisma.campaignRecipient.findFirst({
      where: { twilioMessageSid: messageSid },
    });
    if (recipient) {
      await prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: {
          status: recipientStatus,
          ...(messageStatus === "delivered" ? { deliveredAt: new Date() } : {}),
          ...(messageStatus !== "delivered"
            ? { error: messageStatus === "undelivered" ? "Undelivered" : "Failed" }
            : {}),
        },
      });

      const all = await prisma.campaignRecipient.findMany({
        where: { campaignId: recipient.campaignId },
        select: { status: true, openedAt: true, clickCount: true },
      });
      const { buildCampaignStats } = await import("@/lib/marketing/stats");
      const stats = buildCampaignStats(all);
      await prisma.campaign.update({
        where: { id: recipient.campaignId },
        data: { statsJson: stats },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
