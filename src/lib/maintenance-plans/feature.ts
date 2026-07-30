import { EnrollmentStatus } from "@prisma/client";
import {
  ACTIVE_MAINTENANCE_ENROLLMENT_STATUSES,
  maintenancePlansFeaturesEnabled,
} from "@/lib/company/features";
import { prisma } from "@/lib/prisma";

export async function countActiveMaintenanceEnrollments(companyId: string) {
  return prisma.maintenancePlanEnrollment.count({
    where: {
      companyId,
      status: {
        in: [...ACTIVE_MAINTENANCE_ENROLLMENT_STATUSES] as EnrollmentStatus[],
      },
    },
  });
}

export function assertMaintenancePlansEnabled(company: {
  maintenancePlansFeaturesEnabled?: boolean | null;
}) {
  if (!maintenancePlansFeaturesEnabled(company)) {
    const err = new Error("Maintenance plans are disabled for this company");
    (err as Error & { status: number }).status = 403;
    throw err;
  }
}

export async function requireCompanyMaintenancePlans(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { maintenancePlansFeaturesEnabled: true },
  });
  assertMaintenancePlansEnabled(company ?? {});
}
