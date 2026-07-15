import { prisma } from "@/lib/prisma";
import { syncCallConversionFromLog } from "@/lib/voice/call-conversion";

const STAFF_ROLES = ["ANSWERED", "AGENT_TRANSFER", "EXTERNAL_TRANSFER"] as const;

/**
 * Attach missing answerer / employee data on CallLogs from session assignee
 * or CallParticipant rows. Safe to run repeatedly.
 */
export async function backfillCallLogEmployees(options?: {
  companyId?: string;
  take?: number;
}): Promise<{ scanned: number; updated: number }> {
  const take = options?.take ?? 500;
  const logs = await prisma.callLog.findMany({
    where: {
      scope: "EXTERNAL",
      ...(options?.companyId ? { companyId: options.companyId } : {}),
      OR: [{ userId: null }, { conversion: { is: null } }, { conversion: { answeredByUserId: null } }],
    },
    select: {
      id: true,
      companyId: true,
      sessionId: true,
      userId: true,
      handledByUserId: true,
      conversion: { select: { answeredByUserId: true } },
      session: {
        select: {
          assignedUserId: true,
          assignedUser: { select: { id: true, name: true } },
          participants: {
            where: { role: { in: [...STAFF_ROLES] } },
            orderBy: { joinedAt: "asc" },
            select: {
              id: true,
              role: true,
              userId: true,
              displayName: true,
              user: { select: { id: true, name: true } },
            },
          },
        },
      },
      participants: {
        where: { role: { in: [...STAFF_ROLES] } },
        orderBy: { joinedAt: "asc" },
        select: {
          id: true,
          role: true,
          userId: true,
          displayName: true,
          user: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { startedAt: "desc" },
    take,
  });

  let updated = 0;

  for (const log of logs) {
    if (log.userId && log.conversion?.answeredByUserId) continue;

    const participants = [...log.participants, ...(log.session?.participants ?? [])];
    let answererId: string | null = null;

    for (const role of STAFF_ROLES) {
      const match = participants.find((p) => p.role === role && p.userId);
      if (match?.userId) {
        answererId = match.userId;
        break;
      }
    }

    if (!answererId) {
      answererId = log.session?.assignedUserId ?? log.handledByUserId ?? null;
    }

    if (!answererId) continue;

    try {
      if (!log.userId) {
        await prisma.callLog.update({
          where: { id: log.id },
          data: { userId: answererId },
        });
      }

      if (log.sessionId) {
        await prisma.callParticipant.updateMany({
          where: { callSessionId: log.sessionId, callLogId: null },
          data: { callLogId: log.id },
        });
      }

      if (!log.conversion?.answeredByUserId) {
        await syncCallConversionFromLog(log.id, { answeredByUserId: answererId });
      }

      updated += 1;
    } catch (err) {
      console.error("backfillCallLogEmployees failed for", log.id, err);
    }
  }

  return { scanned: logs.length, updated };
}
