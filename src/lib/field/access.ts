import { VisitStatus, type UserRole } from "@prisma/client";
import { isFieldRole } from "@/lib/employees";
import { prisma } from "@/lib/prisma";

export type FieldAccessUser = {
  id: string;
  companyId: string;
  role: string;
};

/** Crew ids the user belongs to (including as foreman). */
export async function getUserCrewIds(companyId: string, userId: string) {
  const [memberships, foremanCrews] = await Promise.all([
    prisma.crewMember.findMany({
      where: { userId, crew: { companyId } },
      select: { crewId: true },
    }),
    prisma.crew.findMany({
      where: { companyId, foremanUserId: userId },
      select: { id: true },
    }),
  ]);
  return [...new Set([...memberships.map((m) => m.crewId), ...foremanCrews.map((c) => c.id)])];
}

export type VisitAccessFields = {
  companyId: string;
  assignedUserId: string | null;
  crewId: string | null;
  createdByUserId?: string | null;
};

export async function canAccessVisitAsField(
  user: FieldAccessUser,
  visit: VisitAccessFields
): Promise<boolean> {
  if (!isFieldRole(user.role)) return true;
  if (visit.companyId !== user.companyId) return false;
  if (visit.assignedUserId === user.id) return true;
  if (visit.createdByUserId && visit.createdByUserId === user.id) return true;
  if (visit.crewId) {
    const crewIds = await getUserCrewIds(user.companyId, user.id);
    if (crewIds.includes(visit.crewId)) return true;
  }
  return false;
}

export async function assertFieldVisitAccess(
  user: FieldAccessUser,
  visit: VisitAccessFields
): Promise<{ ok: true } | { ok: false; status: 403 | 404 }> {
  if (!isFieldRole(user.role)) return { ok: true };
  if (visit.companyId !== user.companyId) return { ok: false, status: 404 };
  const allowed = await canAccessVisitAsField(user, visit);
  return allowed ? { ok: true } : { ok: false, status: 403 };
}

/** Prisma OR filter for visits assigned to the tech (user or crew). */
export async function fieldVisitAssigneeWhere(companyId: string, userId: string) {
  const crewIds = await getUserCrewIds(companyId, userId);
  const or: Array<Record<string, unknown>> = [
    { assignedUserId: userId },
    { createdByUserId: userId },
  ];
  if (crewIds.length) {
    or.push({ crewId: { in: crewIds } });
  }
  return { companyId, OR: or };
}

export async function getTechSmsWindowDays(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { techSmsPastDays: true, techSmsFutureDays: true },
  });
  return {
    pastDays: company?.techSmsPastDays ?? 7,
    futureDays: company?.techSmsFutureDays ?? 7,
  };
}

/**
 * Customer ids whose EXTERNAL SMS the field user may see:
 * customers on visits assigned to them within ± window days from now.
 */
export async function listEligibleCustomerIdsForFieldSms(
  user: FieldAccessUser,
  now = new Date()
): Promise<string[]> {
  if (!isFieldRole(user.role)) {
    // Office roles: no restriction via this helper (callers should skip).
    return [];
  }

  const { pastDays, futureDays } = await getTechSmsWindowDays(user.companyId);
  const start = new Date(now);
  start.setDate(start.getDate() - pastDays);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setDate(end.getDate() + futureDays);
  end.setHours(23, 59, 59, 999);

  const assigneeWhere = await fieldVisitAssigneeWhere(user.companyId, user.id);
  const visits = await prisma.visit.findMany({
    where: {
      ...assigneeWhere,
      startAt: { lte: end },
      endAt: { gte: start },
      status: { not: VisitStatus.CANCELLED },
      customerId: { not: null },
    },
    select: { customerId: true },
    distinct: ["customerId"],
  });

  return visits
    .map((v) => v.customerId)
    .filter((id): id is string => Boolean(id));
}

export function isFieldRoleString(role: string): role is Extract<UserRole, "TECH" | "INSTALLER"> {
  return isFieldRole(role);
}
