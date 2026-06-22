import { NextRequest, NextResponse } from "next/server";
import { buildCampaignStats } from "@/lib/marketing/stats";
import { prisma } from "@/lib/prisma";
import { validateEmailWebhook } from "@/lib/inbox/email";

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
  const rawBody = await request.text();

  if (
    process.env.TWILIO_EMAIL_WEBHOOK_PUBLIC_KEY &&
    !validateEmailWebhook(rawBody, signature, timestamp)
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  let events: EmailEvent[];
  try {
    events = JSON.parse(rawBody) as EmailEvent[];
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
    const update: {
      status?: string;
      error?: string | null;
      deliveredAt?: Date;
      openedAt?: Date;
    } = {};

    if (eventName === "delivered") {
      update.status = "delivered";
      update.deliveredAt = new Date();
    } else if (eventName === "open" || eventName === "opened") {
      update.openedAt = new Date();
      if (recipient.status === "sent") {
        update.status = "delivered";
        update.deliveredAt = recipient.deliveredAt ?? new Date();
      }
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
    const stats = buildCampaignStats(all);
    await prisma.campaign.update({
      where: { id: recipient.campaignId },
      data: { statsJson: stats },
    });
  }

  return NextResponse.json({ ok: true });
}
