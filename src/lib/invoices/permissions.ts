import type { UserRole } from "@prisma/client";

/** View and manage invoices (customer profile + invoices list). */
export function canAccessInvoices(role: UserRole | string) {
  return role === "ADMIN" || role === "CSR";
}

export function canIssueRefunds(role: UserRole | string) {
  return role === "ADMIN" || role === "CSR";
}
