import { prisma } from "@/lib/prisma";

export function selectClockedInGroupId(params: {
  primaryGroupId: string;
  fallbackGroupId?: string | null;
  primaryHasClockedInMember: boolean;
}): string {
  if (params.primaryHasClockedInMember || !params.fallbackGroupId) {
    return params.primaryGroupId;
  }
  return params.fallbackGroupId;
}

export async function resolveClockedInDialGroup(
  companyId: string,
  config: { groupId?: string; clockedInFallbackGroupId?: string }
) {
  const primary = config.groupId
    ? await prisma.agentGroup.findFirst({
        where: { id: config.groupId, companyId },
        include: { members: { select: { userId: true } } },
      })
    : await prisma.agentGroup.findFirst({
        where: { companyId },
        include: { members: { select: { userId: true } } },
      });

  const fallbackGroupId = config.clockedInFallbackGroupId?.trim();
  if (!primary || !fallbackGroupId || fallbackGroupId === primary.id) return primary;

  const memberIds = primary.members.map((member) => member.userId);
  const clockedInEntry = memberIds.length
    ? await prisma.timeClockEntry.findFirst({
        where: {
          companyId,
          userId: { in: memberIds },
          clockOutAt: null,
          user: { status: "ACTIVE" },
        },
        select: { id: true },
      })
    : null;
  const selectedGroupId = selectClockedInGroupId({
    primaryGroupId: primary.id,
    fallbackGroupId,
    primaryHasClockedInMember: Boolean(clockedInEntry),
  });
  if (selectedGroupId === primary.id) return primary;

  const fallback = await prisma.agentGroup.findFirst({
    where: { id: selectedGroupId, companyId },
    include: { members: { select: { userId: true } } },
  });
  if (!fallback) {
    console.warn("[voice/ivr] clock-in fallback group is unavailable; using primary group", {
      companyId,
      primaryGroupId: primary.id,
      fallbackGroupId: selectedGroupId,
    });
    return primary;
  }

  console.info("[voice/ivr] selected group from clock-in routing", {
    companyId,
    primaryGroupId: primary.id,
    selectedGroupId: fallback.id,
    primaryHasClockedInMember: false,
  });
  return fallback;
}
