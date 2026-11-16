import type { UserRole } from "@prisma/client";

export function canViewAllTimesheets(role: UserRole | string) {
  return role === "ADMIN" || role === "MANAGER" || role === "CSR";
}

export function canEditTimesheets(role: UserRole | string) {
  return role === "ADMIN" || role === "MANAGER" || role === "CSR";
}

export function canViewTimesheetPayPreview(role: UserRole | string) {
  return role === "ADMIN" || role === "MANAGER";
}

export function canManageCompensation(role: UserRole | string) {
  return canViewTimesheetPayPreview(role);
}
