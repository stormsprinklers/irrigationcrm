import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateEmailWebhook } from "@/lib/inbox/email-webhook";
import { trackCampaignEngagement } from "@/lib/marketing/engagement";

type EmailEvent = {
  event?: string;
  sg_message_id?: string;
  email?: string;
  id?: string;
  email_id?: string;
};

export async function POST(request: NextRequest) {
  const signature = request.headers.get("x-twilio-email-event-webhook-signature") ?? "";
  const timestamp = request.headers.get("x-twilio-email-event-webhook-timestamp") ?? "";
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!validateEmailWebhook(rawBody, signature, timestamp)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  let events: EmailEvent[];
  try {
    events = JSON.parse(rawBody.toString("utf8")) as EmailEvent[];
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (!Array.isArray(events)) {
    return NextResponse.json({ ok: true });
  }

  for (const evt of events) {
    const messageId =
      evt.id ??
      evt.email_id ??
      evt.sg_message_id?.split(".")[0];
    if (!messageId) continue;

    const recipient = await prisma.campaignRecipient.findFirst({
      where: {
        OR: [
          { sendgridMessageId: messageId },
          { sendgridMessageId: { contains: messageId } },
        ],
      },
    });
    if (!recipient) continue;

    const eventName = evt.event?.toLowerCase();

    if (eventName === "open" || eventName === "opened") {
      await trackCampaignEngagement({ recipientId: recipient.id, kind: "opened" });
      continue;
    }
    if (eventName === "click" || eventName === "clicked") {
      await trackCampaignEngagement({ recipientId: recipient.id, kind: "clicked" });
      continue;
    }

    const update: {
      status?: string;
      error?: string | null;
      deliveredAt?: Date;
    } = {};

    if (eventName === "delivered") {
      update.status = "delivered";
      update.deliveredAt = new Date();
    } else if (eventName === "bounce" || eventName === "dropped" || eventName === "failed") {
      update.status = "failed";
      update.error = eventName === "bounce" ? "Bounced" : recipient.error;
    }

    if (Object.keys(update).length === 0) continue;

    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: update,
    });

    const all = await prisma.campaignRecipient.findMany({
      where: { campaignId: recipient.campaignId },
      select: { status: true, openedAt: true, clickCount: true },
    });
    const current = await prisma.campaign.findUnique({
      where: { id: recipient.campaignId },
      select: { statsJson: true },
    });
    const { buildCampaignStats, mergeCampaignStatsJson } = await import("@/lib/marketing/stats");
    const stats = mergeCampaignStatsJson(current?.statsJson, buildCampaignStats(all));
    await prisma.campaign.update({
      where: { id: recipient.campaignId },
      data: { statsJson: stats },
    });
  }

  return NextResponse.json({ ok: true });
}
