import { Channel, MessageDirection, Scope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { WEBSITE_FORM_SMS_PREFIX, WEBSITE_LEAD_THREAD_PREFIX } from "@/lib/inbox/website-leads";
import { isCallAnswered } from "@/lib/voice/call-history";
import type { InboxBadgeCounts } from "@/lib/inbox/badge-types";

export type { InboxBadgeCounts };

const MISSED_LOOKBACK_MS = 2 * 24 * 60 * 60 * 1000;

export async function getInboxBadgeCounts(companyId: string): Promise<InboxBadgeCounts> {
  const missedSince = new Date(Date.now() - MISSED_LOOKBACK_MS);

  const [sms, social, leadEmails, leadSms, missedLogs] = await Promise.all([
    prisma.conversation.count({
      where: {
        companyId,
        channel: Channel.SMS,
        scope: Scope.EXTERNAL,
        messages: {
          some: {
            direction: MessageDirection.INBOUND,
            readAt: null,
            NOT: { body: { startsWith: WEBSITE_FORM_SMS_PREFIX } },
          },
        },
      },
    }),
    prisma.conversation.count({
      where: {
        companyId,
        channel: { in: [Channel.FACEBOOK, Channel.INSTAGRAM] },
        messages: {
          some: {
            direction: MessageDirection.INBOUND,
            readAt: null,
          },
        },
      },
    }),
    prisma.emailMessage.count({
      where: {
        companyId,
        isRead: false,
        folder: { not: "TRASH" },
        threadId: { startsWith: WEBSITE_LEAD_THREAD_PREFIX },
        NOT: {
          OR: [
            { subject: { contains: "new job applicant", mode: "insensitive" } },
            { subject: { contains: "careers", mode: "insensitive" } },
          ],
        },
      },
    }),
    prisma.message.count({
      where: {
        direction: MessageDirection.INBOUND,
        readAt: null,
        body: { startsWith: WEBSITE_FORM_SMS_PREFIX },
        NOT: { body: { contains: "careers", mode: "insensitive" } },
        conversation: { companyId, scope: Scope.EXTERNAL },
      },
    }),
    prisma.callLog.findMany({
      where: {
        companyId,
        direction: "INBOUND",
        startedAt: { gte: missedSince },
      },
      select: { status: true, durationSec: true },
      take: 200,
    }),
  ]);

  const missedCalls = missedLogs.filter((log) => {
    const status = log.status.toLowerCase();
    if (["no-answer", "busy", "failed", "canceled", "cancelled"].includes(status)) return true;
    return status === "completed" && !isCallAnswered(log.status, log.durationSec);
  }).length;
  const leads = leadEmails + leadSms;
  const total = sms + social + leads + missedCalls;

  return { sms, social, leads, missedCalls, total };
}

export async function markInboundConversationRead(companyId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, companyId },
    select: { id: true },
  });
  if (!conversation) return;

  await prisma.message.updateMany({
    where: {
      conversationId,
      direction: MessageDirection.INBOUND,
      readAt: null,
    },
    data: { readAt: new Date() },
  });
}
