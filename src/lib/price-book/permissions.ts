import type { UserRole } from "@prisma/client";

export function canViewPriceBook(_role: UserRole) {
  return true;
}

export function canManagePriceBook(role: UserRole) {
  return role === "ADMIN" || role === "MANAGER";
}
