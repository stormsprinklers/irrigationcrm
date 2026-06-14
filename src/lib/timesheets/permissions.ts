import type { UserRole } from "@prisma/client";

export function canViewAllTimesheets(role: UserRole | string) {
  return role === "ADMIN" || role === "MANAGER";
}

export function canManageCompensation(role: UserRole | string) {
  return role === "ADMIN" || role === "MANAGER";
}
