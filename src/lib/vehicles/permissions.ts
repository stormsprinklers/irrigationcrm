import { UserRole } from "@prisma/client";

const VIEW_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.CSR,
  UserRole.TECH,
  UserRole.INSTALLER,
  UserRole.SALES,
];

const MANAGE_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.MANAGER];

export function canViewVehicles(role: string | null | undefined) {
  return Boolean(role && VIEW_ROLES.includes(role as UserRole));
}

export function canManageVehicles(role: string | null | undefined) {
  return Boolean(role && MANAGE_ROLES.includes(role as UserRole));
}

/** Contributors can upload attachments, log mileage/service, and manage issues. */
export function canContributeVehicles(role: string | null | undefined) {
  return canViewVehicles(role);
}
