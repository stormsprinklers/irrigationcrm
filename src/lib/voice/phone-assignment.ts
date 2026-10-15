import { EmployeeStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Resolve a human, active employee who may receive a company's direct line.
 * Keeping this check centralized prevents a caller from assigning a number to
 * an employee in another tenant by submitting an arbitrary user id.
 */
export async function findActivePhoneAssignee(companyId: string, userId: string) {
  return prisma.user.findFirst({
    where: {
      id: userId,
      companyId,
      status: EmployeeStatus.ACTIVE,
      systemKind: null,
    },
    select: { id: true, name: true },
  });
}

export async function isValidPhoneAssignee(companyId: string, userId: string) {
  return Boolean(await findActivePhoneAssignee(companyId, userId));
}
