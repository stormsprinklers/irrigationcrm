import type { UserRole } from "@prisma/client";

export function canViewMaintenancePlans(role: UserRole) {
  return role === "CSR" || role === "MANAGER" || role === "ADMIN" || role === "TECH";
}

export function canManageTemplates(role: UserRole) {
  return role === "MANAGER" || role === "ADMIN";
}

export function canManageEnrollments(role: UserRole) {
  return role === "CSR" || role === "MANAGER" || role === "ADMIN";
}

export function canRefundPlanCharges(role: UserRole) {
  return role === "MANAGER" || role === "ADMIN";
}
