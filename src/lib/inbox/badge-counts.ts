import { Channel, MessageDirection, Scope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isFieldRole } from "@/lib/employees";
import { listEligibleCustomerIdsForFieldSms, type FieldAccessUser } from "@/lib/field/access";
import { countGbpInboxAttention } from "@/lib/google-business/inbox-count";
import { WEBSITE_FORM_SMS_BODY_STARTS_WITH } from "@/lib/inbox/website-leads";
import { countLeadsToContact } from "@/lib/inbox/website-lead-items";
import { isMissedInboundLog, MISSED_CALL_LOOKBACK_MS } from "@/lib/voice/call-history";
import type { InboxBadgeCounts } from "@/lib/inbox/badge-types";

export type { InboxBadgeCounts };

const unreadCustomerSmsWhere = {
  direction: MessageDirection.INBOUND,
  readAt: null,
  NOT: { body: { startsWith: WEBSITE_FORM_SMS_BODY_STARTS_WITH } },
} as const;

export async function getInboxBadgeCounts(
  companyId: string,
  user?: FieldAccessUser
): Promise<InboxBadgeCounts> {
  const missedSince = new Date(Date.now() - MISSED_CALL_LOOKBACK_MS);
  const field = user ? isFieldRole(user.role) : false;
  const eligibleCustomerIds = field && user ? await listEligibleCustomerIdsForFieldSms(user) : null;

  if (field && eligibleCustomerIds && eligibleCustomerIds.length === 0) {
    return { sms: 0, social: 0, leads: 0, missedCalls: 0, googleReviews: 0, total: 0 };
  }

  const customerFilter =
    eligibleCustomerIds != null ? { customerId: { in: eligibleCustomerIds } } : {};

  const [sms, social, leads, missedLogs, googleReviews] = await Promise.all([
    prisma.conversation.count({
      where: {
        companyId,
        channel: Channel.SMS,
        scope: Scope.EXTERNAL,
        ...customerFilter,
        messages: {
          some: unreadCustomerSmsWhere,
        },
      },
    }),
    field
      ? Promise.resolve(0)
      : prisma.conversation.count({
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
    field ? Promise.resolve(0) : countLeadsToContact(companyId),
    prisma.callLog.findMany({
      where: {
        companyId,
        direction: "INBOUND",
        missedReviewedAt: null,
        startedAt: { gte: missedSince },
        ...customerFilter,
      },
      select: { status: true, durationSec: true, dispositionNote: true },
      orderBy: { startedAt: "desc" },
      take: 2000,
    }),
    field ? Promise.resolve(0) : countGbpInboxAttention(companyId),
  ]);

  const missedCalls = field ? 0 : missedLogs.filter((log) => isMissedInboundLog(log)).length;
  const total = sms + social + leads + missedCalls + googleReviews;

  return { sms, social, leads, missedCalls, googleReviews, total };
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
