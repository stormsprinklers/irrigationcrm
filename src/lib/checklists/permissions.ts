import type { UserRole } from "@prisma/client";

export function canManageChecklists(role: UserRole) {
  return role === "ADMIN" || role === "MANAGER";
}
