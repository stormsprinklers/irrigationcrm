import type { UserRole } from "@prisma/client";

export function canIssueRefunds(role: UserRole | string) {
  return role === "ADMIN" || role === "MANAGER";
}
