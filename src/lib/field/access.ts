import { VisitStatus } from "@prisma/client";
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
 * Customers whose SMS/calls a field user may see: anyone they have actually
 * visited (non-cancelled past/current job) or are scheduled to visit.
 */
export async function listEligibleCustomerIdsForFieldSms(
  user: FieldAccessUser
): Promise<string[]> {
  if (!isFieldRole(user.role)) {
    return [];
  }

  const assigneeWhere = await fieldVisitAssigneeWhere(user.companyId, user.id);
  const visits = await prisma.visit.findMany({
    where: {
      ...assigneeWhere,
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

export const FIELD_CUSTOMER_COMMS_FORBIDDEN =
  "You can only view conversations and calls for customers you have visited or are scheduled to visit.";

export async function canAccessFieldCustomerComms(
  user: FieldAccessUser,
  customerId: string | null | undefined
) {
  if (!isFieldRole(user.role)) return true;
  if (!customerId) return false;
  const assigneeWhere = await fieldVisitAssigneeWhere(user.companyId, user.id);
  const visit = await prisma.visit.findFirst({
    where: {
      ...assigneeWhere,
      customerId,
      status: { not: VisitStatus.CANCELLED },
    },
    select: { id: true },
  });
  return Boolean(visit);
}

/** Prisma filter for customer SMS/calls. `null` means no extra restriction. */
export async function fieldCustomerCommsWhere(user: FieldAccessUser) {
  if (!isFieldRole(user.role)) return null;
  const ids = await listEligibleCustomerIdsForFieldSms(user);
  return { customerId: { in: ids } };
}

export async function canAccessFieldSmsConversation(
  user: FieldAccessUser,
  conversation: { scope: string; customerId: string | null }
) {
  if (!isFieldRole(user.role)) return true;
  if (conversation.scope !== "EXTERNAL") return true;
  return canAccessFieldCustomerComms(user, conversation.customerId);
}
