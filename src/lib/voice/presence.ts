import { AgentPresenceStatus } from "@prisma/client";
import { listOperatedVoiceAccounts } from "@/lib/account/operated-accounts";
import { prisma } from "@/lib/prisma";

export async function upsertPresence(
  companyId: string,
  userId: string,
  status: AgentPresenceStatus
) {
  return prisma.agentPresence.upsert({
    where: { userId },
    create: { userId, companyId, status, lastSeenAt: new Date() },
    update: { status, companyId, lastSeenAt: new Date() },
  });
}

/** Mark this person available/busy/offline on every company they can switch into. */
export async function upsertPresenceForOperator(
  user: { id: string; email: string; companyId: string },
  status: AgentPresenceStatus
) {
  const accounts = await listOperatedVoiceAccounts({
    userId: user.id,
    email: user.email,
    companyId: user.companyId,
  });
  const targets = accounts.length
    ? accounts
    : [{ userId: user.id, companyId: user.companyId, companyName: "", brandPrimary: "", brandSoft: "" }];
  await Promise.all(
    targets.map((account) => upsertPresence(account.companyId, account.userId, status))
  );
}

export async function getAvailableAgentIdentities(companyId: string) {
  const members = await prisma.agentPresence.findMany({
    where: {
      companyId,
      status: AgentPresenceStatus.AVAILABLE,
    },
    select: { userId: true },
  });
  return members.map((m) => `${companyId}_${m.userId}`);
}

export async function getNextRoundRobinAgent(
  companyId: string,
  groupId: string
): Promise<string | null> {
  const group = await prisma.agentGroup.findFirst({
    where: { id: groupId, companyId },
    include: {
      members: { orderBy: { sortOrder: "asc" }, include: { user: true } },
    },
  });
  if (!group?.members.length) return null;

  const available = await prisma.agentPresence.findMany({
    where: {
      companyId,
      status: AgentPresenceStatus.AVAILABLE,
      userId: { in: group.members.map((m) => m.userId) },
    },
  });
  const availableIds = new Set(available.map((a) => a.userId));
  const eligible = group.members.filter((m) => availableIds.has(m.userId));
  if (!eligible.length) return null;

  const lastAssigned = await prisma.callSession.findFirst({
    where: { companyId, assignedUserId: { in: eligible.map((e) => e.userId) } },
    orderBy: { createdAt: "desc" },
  });

  if (!lastAssigned?.assignedUserId) {
    return `${companyId}_${eligible[0].userId}`;
  }

  const lastIdx = eligible.findIndex((e) => e.userId === lastAssigned.assignedUserId);
  const next = eligible[(lastIdx + 1) % eligible.length];
  return `${companyId}_${next.userId}`;
}
