import { Channel, Scope } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const SMS_OPEN_INACTIVITY_DAYS = 10;

export function smsOpenActivityCutoff(now = new Date()) {
  return new Date(now.getTime() - SMS_OPEN_INACTIVITY_DAYS * 24 * 60 * 60 * 1000);
}

export function hasRecentSmsActivity(lastMessageAt: Date, now = new Date()) {
  return lastMessageAt.getTime() > smsOpenActivityCutoff(now).getTime();
}

export function mergedSmsOpenState(
  conversations: Array<{ smsOpen: boolean | null; lastMessageAt: Date }>,
  now = new Date()
): boolean | null {
  const latest = conversations.reduce<Date | null>(
    (value, row) => (!value || row.lastMessageAt > value ? row.lastMessageAt : value),
    null
  );
  if (latest && !hasRecentSmsActivity(latest, now)) return false;
  if (conversations.some((row) => row.smsOpen === true)) return true;
  if (conversations.every((row) => row.smsOpen === false)) return false;
  return null;
}

/** Persist the workflow rule so every inbox surface agrees about stale threads. */
export async function archiveInactiveSmsConversations(companyId: string, now = new Date()) {
  return prisma.conversation.updateMany({
    where: {
      companyId,
      channel: Channel.SMS,
      scope: Scope.EXTERNAL,
      OR: [{ smsOpen: true }, { smsOpen: null }],
      lastMessageAt: { lte: smsOpenActivityCutoff(now) },
    },
    data: {
      smsOpen: false,
      smsClosedAt: now,
      smsClosedById: null,
    },
  });
}
