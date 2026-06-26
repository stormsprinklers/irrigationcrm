import { Division, EmployeeStatus, UserRole } from "@prisma/client";

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  CSR: "CSR",
  TECH: "Technician",
  INSTALLER: "Installer",
  SALES: "Sales",
  SOCIAL_MEDIA_MANAGER: "Social Media Manager",
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  ADMIN: "Full access including delete and billing settings",
  MANAGER: "Manage schedule, employees, and customers",
  CSR: "Handle inbox, customers, and scheduling",
  TECH: "Service technician — view assigned service jobs and team inbox",
  INSTALLER: "Install crew member — view assigned install jobs and team inbox",
  SALES: "Manage leads, estimates, and customer sales pipeline",
  SOCIAL_MEDIA_MANAGER: "Create and schedule social posts; submit content for admin review",
};

/** Field roles with limited office/admin access (service techs and installers). */
export function isFieldRole(role: string) {
  return role === "TECH" || role === "INSTALLER";
}

/** Roles allowed to use the Storm CRM iOS / mobile app. */
export function canAccessMobileApp(role: string) {
  return isFieldRole(role) || role === UserRole.ADMIN;
}

export function defaultDivisionForRole(role: string): Division | null {
  if (role === "TECH") return Division.SERVICE;
  return null;
}

export function resolveEmployeeDivision(
  role: string,
  division: Division | null | undefined
): Division | null {
  if (division) return division;
  return defaultDivisionForRole(role);
}

export const PAY_TYPE_LABELS: Record<string, string> = {
  HOURLY: "Hourly",
  COMMISSION: "Commission",
  HYBRID: "Hybrid (higher of hourly + OT or commission)",
  SALARY: "Salary (yearly)",
};

export function canManageEmployees(role: string) {
  return role === "ADMIN" || role === "MANAGER";
}

export function canViewProfitMargins(role: string) {
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

export function splitFullName(name: string): { firstName: string; lastName: string } {
  const trimmed = name.trim();
  if (!trimmed) return { firstName: "", lastName: "" };
  const space = trimmed.indexOf(" ");
  if (space === -1) return { firstName: trimmed, lastName: "" };
  return {
    firstName: trimmed.slice(0, space),
    lastName: trimmed.slice(space + 1).trim(),
  };
}

export function formatEmployeeName(firstName: string, lastName?: string | null) {
  return [firstName.trim(), lastName?.trim()].filter(Boolean).join(" ");
}

export function employeeInitials(firstName: string, lastName?: string | null) {
  const first = firstName.trim()[0] ?? "";
  const last = lastName?.trim()[0] ?? "";
  const initials = `${first}${last}`.toUpperCase();
  return initials || "?";
}

export function parseEmployeeNameFields(input: {
  firstName?: unknown;
  lastName?: unknown;
  name?: unknown;
}):
  | { firstName: string; lastName: string; name: string }
  | { error: string } {
  if (input.firstName !== undefined && input.firstName !== null) {
    const firstName = String(input.firstName).trim();
    if (!firstName) return { error: "First name is required" };
    const lastName = input.lastName != null ? String(input.lastName).trim() : "";
    return { firstName, lastName, name: formatEmployeeName(firstName, lastName) };
  }

  if (input.name !== undefined && String(input.name).trim()) {
    const { firstName, lastName } = splitFullName(String(input.name));
    if (!firstName) return { error: "First name is required" };
    return { firstName, lastName, name: formatEmployeeName(firstName, lastName) };
  }

  return { error: "First name is required" };
}

export function employeeSelectFields() {
  return {
    id: true,
    firstName: true,
    lastName: true,
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
