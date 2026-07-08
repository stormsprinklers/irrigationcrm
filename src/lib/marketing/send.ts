import {
  CampaignChannel,
  CampaignEnrollmentStatus,
  CampaignStatus,
  CampaignType,
} from "@prisma/client";
import { getDefaultFromEmail } from "@/lib/inbox/email";
import { sendCompanyEmail } from "@/lib/inbox/email-branding";
import { sendSms } from "@/lib/inbox/twilio";
import { twilioSmsStatusCallbackUrl } from "@/lib/app-url";
import { isContactBlocked, normalizePhone } from "@/lib/inbox/contacts";
import { assertOutboundCommsEnabled, getOutboundCommsState } from "@/lib/communications/outbound-guard";
import { queryAudienceCustomers } from "@/lib/marketing/audience";
import { rewriteTrackedLinks } from "@/lib/marketing/link-tracking";
import { buildCampaignStats } from "@/lib/marketing/stats";
import type { AudienceFilters, CampaignStats, DripSettings } from "@/lib/marketing/types";
import { prisma } from "@/lib/prisma";

const BATCH_SIZE = 50;

export type { CampaignStats };

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

  const filters = campaign.audienceFilters as AudienceFilters | null;
  if (filters && Object.keys(filters).some((k) => {
    const v = filters[k as keyof AudienceFilters];
    return Array.isArray(v) ? v.length > 0 : Boolean(v);
  })) {
    const customers = await queryAudienceCustomers(
      campaign.companyId,
      campaign.channel,
      filters
    );
    entries = customers.map((c) => ({
      customerId: c.id,
      email: c.email ?? undefined,
      phone: c.phone ?? undefined,
    }));
  } else if (campaign.list?.members.length) {
    entries = campaign.list.members.map((m) => ({
      customerId: m.customerId ?? undefined,
      email: m.email ?? m.customer?.email ?? undefined,
      phone: m.phone ?? m.customer?.phone ?? undefined,
    }));
  } else {
    const customers = await queryAudienceCustomers(
      campaign.companyId,
      campaign.channel,
      null
    );
    entries = customers.map((c) => ({
      customerId: c.id,
      email: c.email ?? undefined,
      phone: c.phone ?? undefined,
    }));
  }

  const unique = new Map<string, (typeof entries)[0]>();
  for (const entry of entries) {
    const key =
      campaign.channel === CampaignChannel.EMAIL
        ? entry.email?.toLowerCase()
        : entry.phone;
    if (!key) continue;
    if (!unique.has(key)) unique.set(key, entry);
  }

  if (unique.size === 0) return;

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

async function refreshCampaignStats(campaignId: string) {
  const all = await prisma.campaignRecipient.findMany({
    where: { campaignId },
    select: { status: true, openedAt: true, clickCount: true },
  });
  const stats = buildCampaignStats(all);
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { statsJson: stats },
  });
  return stats;
}

async function sendToRecipient(
  campaign: {
    id: string;
    companyId: string;
    channel: CampaignChannel;
    subject: string | null;
    name: string;
    bodyText: string;
    bodyHtml: string | null;
    company: {
      sendgridFrom: string | null;
      twilioPhone: string | null;
      name: string;
      emailSenderName: string | null;
      emailLogoUrl: string | null;
    };
  },
  recipient: {
    id: string;
    email: string | null;
    phone: string | null;
  },
  content?: {
    channel?: CampaignChannel;
    subject?: string | null;
    bodyText?: string;
    bodyHtml?: string | null;
  }
) {
  const channel = content?.channel ?? campaign.channel;
  const subject = content?.subject ?? campaign.subject ?? campaign.name;
  const bodyText = content?.bodyText ?? campaign.bodyText;
  const bodyHtml = content?.bodyHtml ?? campaign.bodyHtml;
  const fromEmail = campaign.company.sendgridFrom ?? getDefaultFromEmail();
  const branding = {
    companyName: campaign.company.name,
    sendgridFrom: campaign.company.sendgridFrom,
    emailSenderName: campaign.company.emailSenderName,
    emailLogoUrl: campaign.company.emailLogoUrl,
  };
  const fromPhone = campaign.company.twilioPhone;

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
    return false;
  }

  if (channel === CampaignChannel.SMS) {
    const phone = recipient.phone;
    if (!phone || !fromPhone) {
      await prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: { status: "failed", error: "Missing phone or Twilio number" },
      });
      return false;
    }
    const body = bodyText.includes("Reply STOP")
      ? bodyText
      : `${bodyText}\n\nReply STOP to opt out.`;
    const msg = await sendSms({
      companyId: campaign.companyId,
      from: fromPhone,
      to: normalizePhone(phone),
      body,
      statusCallback: twilioSmsStatusCallbackUrl(),
    });
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: { status: "sent", sentAt: new Date(), twilioMessageSid: msg.sid },
    });
    return true;
  }

  const email = recipient.email;
  if (!email || !fromEmail) {
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: { status: "failed", error: "Missing email or sender" },
    });
    return false;
  }

  const rawHtml =
    bodyHtml ??
    `<p>${bodyText.replace(/\n/g, "<br/>")}</p><p style="font-size:12px;color:#666">Unsubscribe: mailto:${fromEmail}?subject=unsubscribe</p>`;
  const html = rewriteTrackedLinks(rawHtml, recipient.id);

  const response = await sendCompanyEmail(branding, {
    companyId: campaign.companyId,
    to: [email],
    subject,
    text: bodyText,
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
  return true;
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
  await assertOutboundCommsEnabled(
    campaign.companyId,
    campaign.channel === CampaignChannel.SMS ? "sms" : "email"
  );
  if (campaign.status === CampaignStatus.CANCELLED) {
    return { done: true, stats: buildCampaignStats([]) };
  }
  if (campaign.type === CampaignType.DRIP) {
    return { done: true, stats: buildCampaignStats([]) };
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
    const stats = await refreshCampaignStats(campaignId);
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: CampaignStatus.COMPLETED,
        sentAt: new Date(),
      },
    });
    return { done: true, stats };
  }

  for (const recipient of pending) {
    try {
      await sendToRecipient(campaign, recipient);
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
  const stats = await refreshCampaignStats(campaignId);

  if (remaining === 0) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: CampaignStatus.COMPLETED,
        sentAt: new Date(),
      },
    });
    return { done: true, stats };
  }

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

export async function activateDripCampaign(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { steps: { orderBy: { sortOrder: "asc" } } },
  });
  if (!campaign) throw new Error("Campaign not found");
  await assertOutboundCommsEnabled(
    campaign.companyId,
    campaign.channel === CampaignChannel.SMS ? "sms" : "email"
  );
  if (campaign.type !== CampaignType.DRIP) throw new Error("Not a drip campaign");
  if (campaign.steps.length === 0) throw new Error("Add at least one drip step");

  const dripSettings = (campaign.dripSettings ?? {}) as DripSettings;
  const filters = campaign.audienceFilters as AudienceFilters | null;
  const customers = await queryAudienceCustomers(
    campaign.companyId,
    campaign.channel,
    filters
  );

  const startAt = dripSettings.startAt ? new Date(dripSettings.startAt) : new Date();
  const firstDelay = campaign.steps[0]?.delayDays ?? 0;
  const nextSendAt = new Date(startAt);
  nextSendAt.setDate(nextSendAt.getDate() + firstDelay);

  await prisma.$transaction([
    prisma.campaignEnrollment.deleteMany({ where: { campaignId } }),
    prisma.campaignEnrollment.createMany({
      data: customers.map((c) => ({
        campaignId,
        customerId: c.id,
        currentStepIndex: 0,
        nextSendAt,
        status: CampaignEnrollmentStatus.ACTIVE,
      })),
      skipDuplicates: true,
    }),
    prisma.campaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.ACTIVE },
    }),
  ]);

  return { enrolled: customers.length };
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export async function processDripSends() {
  const now = new Date();
  const dayStart = startOfDay(now);

  const enrollments = await prisma.campaignEnrollment.findMany({
    where: {
      status: CampaignEnrollmentStatus.ACTIVE,
      nextSendAt: { lte: now },
      campaign: { status: CampaignStatus.ACTIVE, type: CampaignType.DRIP },
    },
    include: {
      campaign: { include: { company: true, steps: { orderBy: { sortOrder: "asc" } } } },
      customer: { select: { id: true, name: true, email: true, phone: true } },
    },
    take: 200,
  });

  const sentCounts = new Map<string, { email: number; sms: number }>();
  const freezeByCompany = new Map<string, boolean>();

  for (const enrollment of enrollments) {
    const campaign = enrollment.campaign;

    let frozen = freezeByCompany.get(campaign.companyId);
    if (frozen === undefined) {
      frozen = (await getOutboundCommsState(campaign.companyId)).disabled;
      freezeByCompany.set(campaign.companyId, frozen);
    }
    if (frozen) continue;
    const dripSettings = (campaign.dripSettings ?? {}) as DripSettings;
    const emailsPerDay = dripSettings.emailsPerDay ?? 50;
    const smsPerDay = dripSettings.smsPerDay ?? 50;

    const counts = sentCounts.get(campaign.id) ?? { email: 0, sms: 0 };
    const step = campaign.steps[enrollment.currentStepIndex];
    if (!step) {
      await prisma.campaignEnrollment.update({
        where: { id: enrollment.id },
        data: { status: CampaignEnrollmentStatus.COMPLETED },
      });
      continue;
    }

    if (step.channel === CampaignChannel.EMAIL && counts.email >= emailsPerDay) continue;
    if (step.channel === CampaignChannel.SMS && counts.sms >= smsPerDay) continue;

    const todaySent = await prisma.campaignRecipient.count({
      where: {
        campaignId: campaign.id,
        sentAt: { gte: dayStart },
        ...(step.channel === CampaignChannel.EMAIL
          ? { email: { not: null } }
          : { phone: { not: null } }),
      },
    });
    if (step.channel === CampaignChannel.EMAIL && todaySent >= emailsPerDay) continue;
    if (step.channel === CampaignChannel.SMS && todaySent >= smsPerDay) continue;

    const contact =
      step.channel === CampaignChannel.EMAIL
        ? enrollment.customer.email
        : enrollment.customer.phone;
    if (!contact) {
      await prisma.campaignEnrollment.update({
        where: { id: enrollment.id },
        data: { status: CampaignEnrollmentStatus.COMPLETED },
      });
      continue;
    }

    let recipient = await prisma.campaignRecipient.findFirst({
      where: {
        campaignId: campaign.id,
        customerId: enrollment.customerId,
        status: "pending",
      },
    });
    if (!recipient) {
      recipient = await prisma.campaignRecipient.create({
        data: {
          campaignId: campaign.id,
          customerId: enrollment.customerId,
          email: enrollment.customer.email,
          phone: enrollment.customer.phone,
          status: "pending",
        },
      });
    }

    try {
      await sendToRecipient(campaign, recipient, {
        channel: step.channel,
        subject: step.subject,
        bodyText: step.bodyText,
        bodyHtml: step.bodyHtml,
      });
      if (step.channel === CampaignChannel.EMAIL) counts.email++;
      else counts.sms++;
      sentCounts.set(campaign.id, counts);
    } catch {
      continue;
    }

    const nextIndex = enrollment.currentStepIndex + 1;
    const nextStep = campaign.steps[nextIndex];
    if (!nextStep) {
      await prisma.campaignEnrollment.update({
        where: { id: enrollment.id },
        data: { status: CampaignEnrollmentStatus.COMPLETED },
      });
    } else {
      const nextSendAt = new Date(now);
      nextSendAt.setDate(nextSendAt.getDate() + (nextStep.delayDays ?? 0));
      await prisma.campaignEnrollment.update({
        where: { id: enrollment.id },
        data: {
          currentStepIndex: nextIndex,
          nextSendAt,
        },
      });
    }

    await refreshCampaignStats(campaign.id);
  }

  return { processed: enrollments.length };
}
