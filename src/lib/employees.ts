import { EmployeeStatus, UserRole } from "@prisma/client";

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  CSR: "CSR",
  TECH: "Technician",
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  ADMIN: "Full access including delete and billing settings",
  MANAGER: "Manage schedule, employees, and customers",
  CSR: "Handle inbox, customers, and scheduling",
  TECH: "View assigned jobs and team inbox",
};

export function canManageEmployees(role: string) {
  return role === "ADMIN" || role === "MANAGER";
}

export function canDeleteEmployee(role: string) {
  return role === "ADMIN";
}

export function employeeSelectFields() {
  return {
    id: true,
    name: true,
    email: true,
    phone: true,
    role: true,
    title: true,
    status: true,
    division: true,
    color: true,
    photoUrl: true,
    address: true,
    city: true,
    state: true,
    zip: true,
    birthDate: true,
    tags: true,
    createdAt: true,
    serviceAreas: {
      include: { serviceArea: { select: { id: true, name: true, color: true } } },
    },
    crewMemberships: {
      include: { crew: { select: { id: true, name: true, color: true } } },
    },
  } as const;
}

export type EmployeeStatusFilter = EmployeeStatus | "ALL";
