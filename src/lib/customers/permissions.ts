import type { UserRole } from "@prisma/client";

export function canManageCustomers(role: UserRole | string) {
  return role === "ADMIN" || role === "MANAGER";
}

export function canFlagDoNotService(role: UserRole | string) {
  return (
    role === "ADMIN" ||
    role === "MANAGER" ||
    role === "CSR" ||
    role === "SALES" ||
    role === "TECH"
  );
}

export function canEditCustomerTags(role: UserRole | string) {
  return (
    role === "ADMIN" ||
    role === "MANAGER" ||
    role === "CSR" ||
    role === "SALES" ||
    role === "TECH" ||
    role === "INSTALLER"
  );
}
