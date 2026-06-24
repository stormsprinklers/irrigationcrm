import { EmployeeStatus, UserRole } from "@prisma/client";

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  CSR: "CSR",
  TECH: "Technician",
  SOCIAL_MEDIA_MANAGER: "Social Media Manager",
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  ADMIN: "Full access including delete and billing settings",
  MANAGER: "Manage schedule, employees, and customers",
  CSR: "Handle inbox, customers, and scheduling",
  TECH: "View assigned jobs and team inbox",
  SOCIAL_MEDIA_MANAGER: "Create and schedule social posts; submit content for admin review",
};

export const PAY_TYPE_LABELS: Record<string, string> = {
  HOURLY: "Hourly",
  COMMISSION: "Commission",
  HYBRID: "Hybrid (higher of hourly or commission)",
  SALARY: "Salary (yearly)",
};

export function canManageEmployees(role: string) {
  return role === "ADMIN" || role === "MANAGER";
}

export function canDeleteEmployee(role: string) {
  return role === "ADMIN";
}

export function canSetEmployeePassword(role: string) {
  return role === "ADMIN";
}

export function validateEmployeePassword(password: string) {
  const value = password.trim();
  if (value.length < 8) {
    return "Password must be at least 8 characters";
  }
  return null;
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
    websiteTeamSlug: true,
    address: true,
    city: true,
    state: true,
    zip: true,
    birthDate: true,
    tags: true,
    payType: true,
    hourlyRate: true,
    commissionPercent: true,
    annualSalary: true,
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
