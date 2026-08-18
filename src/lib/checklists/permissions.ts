import type { UserRole } from "@prisma/client";

export function canViewChecklistSettings(role: UserRole | string) {
  return role === "ADMIN" || role === "MANAGER" || role === "CSR";
}

export function canManageChecklists(role: UserRole | string) {
  return role === "ADMIN" || role === "MANAGER";
}
