import { NextRequest, NextResponse } from "next/server";
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
      include: { campaign: true },
    });
    if (!recipient) continue;

    let status = recipient.status;
    const eventName = evt.event?.toLowerCase();
    if (eventName === "delivered") status = "delivered";
    else if (eventName === "open" || eventName === "opened") status = "delivered";
    else if (eventName === "bounce" || eventName === "dropped" || eventName === "failed") {
      status = "failed";
    }

    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: {
        status,
        error: eventName === "bounce" ? "Bounced" : recipient.error,
      },
    });

    const all = await prisma.campaignRecipient.findMany({
      where: { campaignId: recipient.campaignId },
      select: { status: true },
    });
    const stats = {
      sent: all.filter((r) => r.status === "sent" || r.status === "delivered").length,
      delivered: all.filter((r) => r.status === "delivered").length,
      failed: all.filter((r) => r.status === "failed" || r.status === "opt_out").length,
      pending: all.filter((r) => r.status === "pending").length,
      opened: all.filter((r) => r.status === "delivered").length,
    };
    await prisma.campaign.update({
      where: { id: recipient.campaignId },
      data: { statsJson: stats },
    });
  }

  return NextResponse.json({ ok: true });
}
