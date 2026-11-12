import { UserRole } from "@prisma/client";

const OFFICE_SPEC_ROLES = new Set<UserRole>([
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.CSR,
  UserRole.SALES,
]);

export function canEditEstimateHolidayLightingSpecs(
  role: UserRole | string | null | undefined
) {
  return Boolean(role && OFFICE_SPEC_ROLES.has(role as UserRole));
}

export function canEditVisitHolidayLightingSpecs(
  role: UserRole | string | null | undefined
) {
  return (
    canEditEstimateHolidayLightingSpecs(role) ||
    role === UserRole.TECH ||
    role === UserRole.INSTALLER
  );
}
