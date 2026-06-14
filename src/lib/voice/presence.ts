import { AgentPresenceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function upsertPresence(
  companyId: string,
  userId: string,
  status: AgentPresenceStatus
) {
  return prisma.agentPresence.upsert({
    where: { userId },
    create: { userId, companyId, status, lastSeenAt: new Date() },
    update: { status, lastSeenAt: new Date() },
  });
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
