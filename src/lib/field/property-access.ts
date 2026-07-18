import { prisma } from "@/lib/prisma";
import {
  canAccessVisitAsField,
  fieldVisitAssigneeWhere,
  type FieldAccessUser,
} from "@/lib/field/access";
import { isFieldRole } from "@/lib/employees";

/** Field user may control Rachio/map on a property if they have an accessible visit for that customer/property. */
export async function canAccessPropertyAsField(
  user: FieldAccessUser,
  customerId: string,
  propertyId: string
): Promise<boolean> {
  if (!isFieldRole(user.role)) return true;

  const assigneeWhere = await fieldVisitAssigneeWhere(user.companyId, user.id);
  const visit = await prisma.visit.findFirst({
    where: {
      AND: [
        assigneeWhere,
        { customerId },
        {
          OR: [{ propertyId }, { propertyId: null }],
        },
        { status: { not: "CANCELLED" } },
      ],
    },
    select: { id: true },
  });
  if (visit) return true;

  const propertyVisit = await prisma.visit.findFirst({
    where: {
      companyId: user.companyId,
      propertyId,
      status: { not: "CANCELLED" },
    },
    select: {
      companyId: true,
      assignedUserId: true,
      crewId: true,
      createdByUserId: true,
    },
  });
  if (!propertyVisit) return false;
  return canAccessVisitAsField(user, propertyVisit);
}

export async function canAccessCustomerAsField(
  user: FieldAccessUser,
  customerId: string
): Promise<boolean> {
  if (!isFieldRole(user.role)) return true;
  const assigneeWhere = await fieldVisitAssigneeWhere(user.companyId, user.id);
  const visit = await prisma.visit.findFirst({
    where: {
      AND: [assigneeWhere, { customerId }, { status: { not: "CANCELLED" } }],
    },
    select: { id: true },
  });
  return Boolean(visit);
}
