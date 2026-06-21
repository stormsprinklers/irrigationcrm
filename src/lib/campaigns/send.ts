import { CampaignChannel, CampaignStatus } from "@prisma/client";
import { getDefaultFromEmail, sendEmail } from "@/lib/inbox/email";
import { sendSms } from "@/lib/inbox/twilio";
import { isContactBlocked, normalizePhone } from "@/lib/inbox/contacts";
import { prisma } from "@/lib/prisma";

const BATCH_SIZE = 50;

type CampaignStats = {
  sent: number;
  delivered: number;
  failed: number;
  pending: number;
  opened?: number;
};

function buildStats(recipients: Array<{ status: string }>): CampaignStats {
  const stats: CampaignStats = { sent: 0, delivered: 0, failed: 0, pending: 0 };
  for (const r of recipients) {
    if (r.status === "pending") stats.pending++;
    else if (r.status === "sent" || r.status === "delivered") stats.sent++;
    else if (r.status === "delivered") stats.delivered++;
    else if (r.status === "failed" || r.status === "opt_out") stats.failed++;
  }
  stats.delivered = recipients.filter((r) => r.status === "delivered").length;
  stats.failed = recipients.filter((r) => r.status === "failed" || r.status === "opt_out").length;
  stats.sent = recipients.filter((r) => r.status === "sent" || r.status === "delivered").length;
  stats.pending = recipients.filter((r) => r.status === "pending").length;
  return stats;
}

export async function buildCampaignRecipients(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      list: { include: { members: { include: { customer: true } } } },
    },
  });
  if (!campaign) throw new Error("Campaign not found");

  const existing = await prisma.campaignRecipient.count({ where: { campaignId } });
  if (existing > 0) return;

  let entries: Array<{
    customerId?: string;
    email?: string;
    phone?: string;
  }> = [];

  if (campaign.list?.members.length) {
    entries = campaign.list.members.map((m) => ({
      customerId: m.customerId ?? undefined,
      email: m.email ?? m.customer?.email ?? undefined,
      phone: m.phone ?? m.customer?.phone ?? undefined,
    }));
  } else {
    const customers = await prisma.customer.findMany({
      where: { companyId: campaign.companyId },
      select: { id: true, email: true, phone: true },
    });
    entries = customers.map((c) => ({
      customerId: c.id,
      email: c.email ?? undefined,
      phone: c.phone ?? undefined,
    }));
  }

  const unique = new Map<string, typeof entries[0]>();
  for (const entry of entries) {
    const key =
      campaign.channel === CampaignChannel.EMAIL
        ? entry.email?.toLowerCase()
        : entry.phone;
    if (!key) continue;
    if (!unique.has(key)) unique.set(key, entry);
  }

  await prisma.campaignRecipient.createMany({
    data: Array.from(unique.values()).map((entry) => ({
      campaignId,
      customerId: entry.customerId ?? null,
      email: entry.email ?? null,
      phone: entry.phone ?? null,
      status: "pending",
    })),
  });
}

export async function sendCampaignBatch(campaignId: string): Promise<{
  done: boolean;
  stats: CampaignStats;
}> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { company: true },
  });
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.status === CampaignStatus.CANCELLED) {
    return { done: true, stats: buildStats([]) };
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: CampaignStatus.SENDING },
  });

  const pending = await prisma.campaignRecipient.findMany({
    where: { campaignId, status: "pending" },
    take: BATCH_SIZE,
  });

  if (pending.length === 0) {
    const all = await prisma.campaignRecipient.findMany({
      where: { campaignId },
      select: { status: true },
    });
    const stats = buildStats(all);
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: CampaignStatus.COMPLETED,
        sentAt: new Date(),
        statsJson: stats,
      },
    });
    return { done: true, stats };
  }

  const fromEmail = campaign.company.sendgridFrom ?? getDefaultFromEmail();
  const fromPhone = campaign.company.twilioPhone;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  for (const recipient of pending) {
    const blocked = await isContactBlocked(
      campaign.companyId,
      recipient.phone,
      recipient.email
    );
    if (blocked) {
      await prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: { status: "opt_out", error: "Contact blocked" },
      });
      continue;
    }

    try {
      if (campaign.channel === CampaignChannel.SMS) {
        const phone = recipient.phone;
        if (!phone || !fromPhone) {
          await prisma.campaignRecipient.update({
            where: { id: recipient.id },
            data: { status: "failed", error: "Missing phone or Twilio number" },
          });
          continue;
        }
        const body = campaign.bodyText.includes("Reply STOP")
          ? campaign.bodyText
          : `${campaign.bodyText}\n\nReply STOP to opt out.`;
        const msg = await sendSms({
          from: fromPhone,
          to: normalizePhone(phone),
          body,
          statusCallback: `${appUrl}/api/twilio/sms/status`,
        });
        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: "sent", sentAt: new Date(), twilioMessageSid: msg.sid },
        });
      } else {
        const email = recipient.email;
        if (!email || !fromEmail) {
          await prisma.campaignRecipient.update({
            where: { id: recipient.id },
            data: { status: "failed", error: "Missing email or sender" },
          });
          continue;
        }
        const html =
          campaign.bodyHtml ??
          `<p>${campaign.bodyText.replace(/\n/g, "<br/>")}</p><p style="font-size:12px;color:#666">Unsubscribe: mailto:${fromEmail}?subject=unsubscribe</p>`;
        const response = await sendEmail({
          from: fromEmail,
          to: [email],
          subject: campaign.subject ?? campaign.name,
          text: campaign.bodyText,
          html,
        });
        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: {
            status: "sent",
            sentAt: new Date(),
            sendgridMessageId: response.messageId,
          },
        });
      }
    } catch (err) {
      await prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: {
          status: "failed",
          error: err instanceof Error ? err.message : "Send failed",
        },
      });
    }
  }

  const remaining = await prisma.campaignRecipient.count({
    where: { campaignId, status: "pending" },
  });

  const all = await prisma.campaignRecipient.findMany({
    where: { campaignId },
    select: { status: true },
  });
  const stats = buildStats(all);

  if (remaining === 0) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: CampaignStatus.COMPLETED,
        sentAt: new Date(),
        statsJson: stats,
      },
    });
    return { done: true, stats };
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { statsJson: stats },
  });

  return { done: false, stats };
}

export async function sendCampaign(campaignId: string) {
  await buildCampaignRecipients(campaignId);

  let done = false;
  let stats: CampaignStats = { sent: 0, delivered: 0, failed: 0, pending: 0 };
  let iterations = 0;
  const maxIterations = 200;

  while (!done && iterations < maxIterations) {
    const result = await sendCampaignBatch(campaignId);
    done = result.done;
    stats = result.stats;
    iterations++;
  }

  return stats;
}
