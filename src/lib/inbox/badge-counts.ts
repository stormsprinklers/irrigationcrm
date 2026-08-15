import { Channel, MessageDirection, Scope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { WEBSITE_FORM_SMS_BODY_STARTS_WITH } from "@/lib/inbox/website-leads";
import { countLeadsToContact } from "@/lib/inbox/website-lead-items";
import { isCallAnswered, isVoicemailDisposition, MISSED_CALL_LOOKBACK_MS } from "@/lib/voice/call-history";
import type { InboxBadgeCounts } from "@/lib/inbox/badge-types";

export type { InboxBadgeCounts };

const unreadCustomerSmsWhere = {
  direction: MessageDirection.INBOUND,
  readAt: null,
  NOT: { body: { startsWith: WEBSITE_FORM_SMS_BODY_STARTS_WITH } },
} as const;

export async function getInboxBadgeCounts(companyId: string): Promise<InboxBadgeCounts> {
  const missedSince = new Date(Date.now() - MISSED_CALL_LOOKBACK_MS);

  const [sms, social, leads, missedLogs] = await Promise.all([
    prisma.conversation.count({
      where: {
        companyId,
        channel: Channel.SMS,
        scope: Scope.EXTERNAL,
        messages: {
          some: unreadCustomerSmsWhere,
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
    countLeadsToContact(companyId),
    prisma.callLog.findMany({
      where: {
        companyId,
        direction: "INBOUND",
        startedAt: { gte: missedSince },
      },
      select: { status: true, durationSec: true, dispositionNote: true },
      take: 200,
    }),
  ]);

  const missedCalls = missedLogs.filter((log) => {
    if (isVoicemailDisposition(log.dispositionNote)) return true;
    const status = log.status.toLowerCase();
    if (["no-answer", "busy", "failed", "canceled", "cancelled"].includes(status)) return true;
    return status === "completed" && !isCallAnswered(log.status, log.durationSec, {
      dispositionNote: log.dispositionNote,
    });
  }).length;
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
