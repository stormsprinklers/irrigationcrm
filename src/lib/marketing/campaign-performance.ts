import {
  CampaignChannel,
  CampaignEnrollmentStatus,
  CampaignType,
  EmailFolder,
  MessageDirection,
} from "@prisma/client";
import { rateOrNull } from "@/lib/marketing/stats";
import { prisma } from "@/lib/prisma";

export type CampaignMessagePerformance = {
  key: string;
  label: string;
  channel: "EMAIL" | "SMS" | "MIXED";
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  openRate: number | null;
  ctr: number | null;
};

export type CampaignPerformance = {
  enrolled: { active: number; completed: number; total: number };
  deliverability: {
    sent: number;
    delivered: number;
    failed: number;
    bounced: number;
    pending: number;
    optedOut: number;
    deliveryRate: number | null;
    failRate: number | null;
  };
  emails: CampaignMessagePerformance[];
  sms: CampaignMessagePerformance[];
  links: Array<{ url: string; clicks: number }>;
  overallCtr: number | null;
  responses: {
    emailSent: number;
    emailReplied: number;
    emailRate: number | null;
    smsSent: number;
    smsReplied: number;
    smsRate: number | null;
  };
  unsubscribes: {
    count: number;
    rate: number | null;
  };
};

function asConfig(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function recipientChannel(
  row: { channel: CampaignChannel | null; openedAt: Date | null; email: string | null; phone: string | null },
  campaignChannel: CampaignChannel
): CampaignChannel {
  if (row.channel) return row.channel;
  if (row.openedAt) return CampaignChannel.EMAIL;
  if (row.email && !row.phone) return CampaignChannel.EMAIL;
  if (row.phone && !row.email) return CampaignChannel.SMS;
  return campaignChannel;
}

export async function getCampaignPerformance(campaignId: string): Promise<CampaignPerformance | null> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      flowNodes: { orderBy: { sortOrder: "asc" } },
      enrollments: { select: { status: true } },
    },
  });
  if (!campaign) return null;

  const recipients = await prisma.campaignRecipient.findMany({
    where: { campaignId },
    select: {
      id: true,
      customerId: true,
      email: true,
      phone: true,
      status: true,
      flowNodeId: true,
      channel: true,
      sentAt: true,
      openedAt: true,
      clickedAt: true,
      clickCount: true,
      error: true,
    },
  });

  const sentStatuses = new Set(["sent", "delivered"]);
  const sentRows = recipients.filter((row) => sentStatuses.has(row.status));
  const deliveredRows = recipients.filter((row) => row.status === "delivered");
  const failedRows = recipients.filter((row) => row.status === "failed");
  const bounced = failedRows.filter((row) => /bounce/i.test(row.error ?? "")).length;
  const optedOut = recipients.filter(
    (row) => row.status === "opt_out" || /opt.?out|unsubscrib/i.test(row.error ?? "")
  ).length;
  const pending = recipients.filter((row) => row.status === "pending").length;

  const activeEnrollments = campaign.enrollments.filter(
    (row) => row.status === CampaignEnrollmentStatus.ACTIVE
  ).length;
  const completedEnrollments = campaign.enrollments.filter(
    (row) => row.status === CampaignEnrollmentStatus.COMPLETED
  ).length;

  const blastActive = campaign.type === CampaignType.BLAST ? pending : activeEnrollments;
  const blastCompleted =
    campaign.type === CampaignType.BLAST
      ? new Set(sentRows.map((row) => row.customerId ?? row.id)).size
      : completedEnrollments;

  const nodeById = new Map(campaign.flowNodes.map((node) => [node.id, node]));
  const groups = new Map<string, typeof recipients>();
  for (const row of recipients) {
    const key =
      row.flowNodeId && nodeById.has(row.flowNodeId)
        ? row.flowNodeId
        : recipientChannel(row, campaign.channel) === CampaignChannel.EMAIL
          ? "email"
          : "sms";
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const emails: CampaignMessagePerformance[] = [];
  for (const [key, rows] of groups) {
    const node = nodeById.get(key);
    const config = node ? asConfig(node.config) : {};
    const channel =
      node?.type === "SEND_SMS"
        ? "SMS"
        : node?.type === "SEND_EMAIL"
          ? "EMAIL"
          : key === "sms"
            ? "SMS"
            : "EMAIL";
    if (channel === "SMS" && node?.type !== "SEND_EMAIL" && key !== "email") {
      const sent = rows.filter((row) => sentStatuses.has(row.status)).length;
      const delivered = rows.filter((row) => row.status === "delivered" || row.status === "sent").length;
      emails.push({
        key,
        label:
          node && typeof config.bodyText === "string" && config.bodyText.trim()
            ? `SMS: ${String(config.bodyText).slice(0, 48)}`
            : node
              ? `SMS step ${node.sortOrder + 1}`
              : "SMS",
        channel: "SMS",
        sent,
        delivered,
        opened: 0,
        clicked: rows.filter((row) => (row.clickCount ?? 0) > 0).length,
        openRate: null,
        ctr: rateOrNull(
          rows.filter((row) => (row.clickCount ?? 0) > 0).length,
          delivered
        ),
      });
      continue;
    }
    const sent = rows.filter((row) => sentStatuses.has(row.status)).length;
    const delivered = rows.filter((row) => row.status === "delivered").length;
    const opened = rows.filter((row) => row.openedAt).length;
    const clicked = rows.filter((row) => (row.clickCount ?? 0) > 0).length;
    const subject =
      (typeof config.subject === "string" && config.subject) ||
      campaign.subject ||
      "Email";
    emails.push({
      key,
      label: node ? `Email: ${subject}` : subject,
      channel: "EMAIL",
      sent,
      delivered,
      opened,
      clicked,
      openRate: rateOrNull(opened, Math.max(delivered, sent && delivered === 0 ? sent : delivered)),
      ctr: rateOrNull(clicked, Math.max(delivered, 0)),
    });
  }

  const emailGroups = emails.filter((row) => row.channel === "EMAIL");
  const smsGroups = emails.filter((row) => row.channel === "SMS");
  const statsJson =
    campaign.statsJson && typeof campaign.statsJson === "object"
      ? (campaign.statsJson as Record<string, unknown>)
      : {};
  const linkClicks =
    statsJson.linkClicks && typeof statsJson.linkClicks === "object"
      ? (statsJson.linkClicks as Record<string, number>)
      : {};
  const links = Object.entries(linkClicks)
    .map(([url, clicks]) => ({ url, clicks }))
    .sort((a, b) => b.clicks - a.clicks);

  const emailDelivered = emailGroups.reduce((sum, row) => sum + row.delivered, 0);
  const emailClicked = emailGroups.reduce((sum, row) => sum + row.clicked, 0);

  const emailRecipients = sentRows.filter(
    (row) => recipientChannel(row, campaign.channel) === CampaignChannel.EMAIL
  );
  const smsRecipients = sentRows.filter(
    (row) => recipientChannel(row, campaign.channel) === CampaignChannel.SMS
  );

  const firstSentByCustomer = new Map<string, Date>();
  for (const row of sentRows) {
    if (!row.customerId || !row.sentAt) continue;
    const prev = firstSentByCustomer.get(row.customerId);
    if (!prev || row.sentAt < prev) firstSentByCustomer.set(row.customerId, row.sentAt);
  }
  const customerIds = [...firstSentByCustomer.keys()];
  const earliest = [...firstSentByCustomer.values()].sort(
    (a, b) => a.getTime() - b.getTime()
  )[0];

  const emailCustomerIds = new Set(
    emailRecipients.map((row) => row.customerId).filter((id): id is string => Boolean(id))
  );
  const smsCustomerIds = new Set(
    smsRecipients.map((row) => row.customerId).filter((id): id is string => Boolean(id))
  );

  let emailReplied = 0;
  let smsReplied = 0;
  if (customerIds.length > 0 && earliest) {
    const [inboundSms, inboundEmail] = await Promise.all([
      prisma.message.findMany({
        where: {
          direction: MessageDirection.INBOUND,
          sentAt: { gte: earliest },
          conversation: {
            companyId: campaign.companyId,
            customerId: { in: customerIds },
          },
        },
        select: { sentAt: true, conversation: { select: { customerId: true } } },
      }),
      prisma.emailMessage.findMany({
        where: {
          companyId: campaign.companyId,
          customerId: { in: customerIds },
          folder: EmailFolder.INBOX,
          createdAt: { gte: earliest },
        },
        select: { createdAt: true, customerId: true },
      }),
    ]);

    const smsHits = new Set<string>();
    for (const message of inboundSms) {
      const customerId = message.conversation.customerId;
      if (!customerId || !smsCustomerIds.has(customerId)) continue;
      const since = firstSentByCustomer.get(customerId);
      if (since && message.sentAt >= since) smsHits.add(customerId);
    }
    const emailHits = new Set<string>();
    for (const email of inboundEmail) {
      const customerId = email.customerId;
      if (!customerId || !emailCustomerIds.has(customerId)) continue;
      const since = firstSentByCustomer.get(customerId);
      if (since && email.createdAt >= since) emailHits.add(customerId);
    }
    smsReplied = smsHits.size;
    emailReplied = emailHits.size;
  }

  const uniqueSentCustomers = new Set(
    sentRows.map((row) => row.customerId).filter((id): id is string => Boolean(id))
  );
  let unsubCount = optedOut;
  if (uniqueSentCustomers.size > 0) {
    const opted = await prisma.customer.count({
      where: {
        id: { in: [...uniqueSentCustomers] },
        companyId: campaign.companyId,
        OR: [{ marketingEmailOptOut: true }, { marketingSmsOptOut: true }],
      },
    });
    unsubCount = Math.max(optedOut, opted);
  }

  const emailSentUnique = emailCustomerIds.size;
  const smsSentUnique = smsCustomerIds.size;

  return {
    enrolled: {
      active: blastActive,
      completed: blastCompleted,
      total: blastActive + blastCompleted,
    },
    deliverability: {
      sent: sentRows.length,
      delivered: deliveredRows.length,
      failed: failedRows.length,
      bounced,
      pending,
      optedOut,
      deliveryRate: rateOrNull(sentRows.length, sentRows.length + failedRows.length),
      failRate: rateOrNull(failedRows.length, sentRows.length + failedRows.length),
    },
    emails: emailGroups,
    sms: smsGroups,
    links,
    overallCtr: rateOrNull(emailClicked, emailDelivered || emailGroups.reduce((s, r) => s + r.sent, 0)),
    responses: {
      emailSent: emailSentUnique,
      emailReplied,
      emailRate: rateOrNull(emailReplied, emailSentUnique),
      smsSent: smsSentUnique,
      smsReplied,
      smsRate: rateOrNull(smsReplied, smsSentUnique),
    },
    unsubscribes: {
      count: unsubCount,
      rate: rateOrNull(unsubCount, uniqueSentCustomers.size || sentRows.length),
    },
  };
}
