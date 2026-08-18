import type { UserRole } from "@prisma/client";

export function canViewPriceBook(_role: UserRole | string | null | undefined) {
  return true;
}

export function canManagePriceBook(role: UserRole | string | null | undefined) {
  return role === "ADMIN" || role === "MANAGER";
}
