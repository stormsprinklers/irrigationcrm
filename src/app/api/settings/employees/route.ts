import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { EmployeeStatus, UserRole } from "@prisma/client";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageEmployees, canSetEmployeePassword, employeeSelectFields, parseEmployeeNameFields, resolveEmployeeDivision, validateEmployeePassword } from "@/lib/employees";
import { resolveCreateEmployeePay } from "@/lib/compensation/defaults";
import { pushEmployeeToLms } from "@/lib/integrations/lms-sync";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const status = request.nextUrl.searchParams.get("status") as EmployeeStatus | "ALL" | null;

    const employees = await prisma.user.findMany({
      where: {
        companyId: user.companyId,
        ...(status && status !== "ALL" ? { status } : {}),
      },
      orderBy: [{ status: "asc" }, { firstName: "asc" }, { lastName: "asc" }],
      select: employeeSelectFields(),
    });

    return NextResponse.json(employees);
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageEmployees(user.role)) return forbiddenResponse();

    const body = await request.json();
    const { firstName, lastName, name, email, phone, role, title, division, color, address, city, state, zip, birthDate, tags, serviceAreaIds, payType, hourlyRate, commissionPercent, annualSalary, websiteTeamSlug } = body;

    if (!email) return badRequestResponse("Email is required");
    if (!phone || !String(phone).trim()) {
      return badRequestResponse(
        "Mobile phone is required for SMS two-factor authentication",
      );
    }

    const nameFields = parseEmployeeNameFields({ firstName, lastName, name });
    if ("error" in nameFields) return badRequestResponse(nameFields.error);

    const existing = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } });
    if (existing) return badRequestResponse("Email already in use");

    let plainPassword = "password123";
    if (body.password != null && String(body.password).length > 0) {
      if (!canSetEmployeePassword(user.role)) {
        return forbiddenResponse("Only admins can set a custom login password");
      }
      plainPassword = String(body.password);
      const passwordError = validateEmployeePassword(plainPassword);
      if (passwordError) return badRequestResponse(passwordError);
      const confirmPassword =
        body.confirmPassword != null ? String(body.confirmPassword) : plainPassword;
      if (plainPassword !== confirmPassword) {
        return badRequestResponse("Passwords do not match");
      }
    }

    const passwordHash = await bcrypt.hash(plainPassword, 10);

    const company = await prisma.company.findUniqueOrThrow({
      where: { id: user.companyId },
      select: {
        defaultTechnicianPayType: true,
        defaultTechnicianHourlyRate: true,
        defaultTechnicianCommissionPercent: true,
        overtimeWeeklyThresholdHours: true,
        overtimeRateMultiplier: true,
      },
    });

    const employeeRole = (role as UserRole) ?? UserRole.CSR;
    const resolvedPay = resolveCreateEmployeePay(
      employeeRole,
      { payType, hourlyRate, commissionPercent },
      company
    );

    const employee = await prisma.user.create({
      data: {
        companyId: user.companyId,
        firstName: nameFields.firstName,
        lastName: nameFields.lastName,
        name: nameFields.name,
        email: String(email).toLowerCase(),
        phone: phone ?? null,
        role: employeeRole,
        title: title ?? null,
        division: resolveEmployeeDivision(employeeRole, division ?? null),
        color: color ?? "#2563EB",
        address: address ?? null,
        city: city ?? null,
        state: state ?? null,
        zip: zip ?? null,
        birthDate: birthDate ? new Date(birthDate) : null,
        tags: Array.isArray(tags) ? tags : [],
        payType: resolvedPay.payType,
        hourlyRate: resolvedPay.hourlyRate,
        commissionPercent: resolvedPay.commissionPercent,
        annualSalary: annualSalary != null ? Number(annualSalary) : null,
        websiteTeamSlug: websiteTeamSlug ? String(websiteTeamSlug) : null,
        passwordHash,
        serviceAreas: serviceAreaIds?.length
          ? {
              create: serviceAreaIds.map((serviceAreaId: string) => ({ serviceAreaId })),
            }
          : undefined,
      },
      select: employeeSelectFields(),
    });

    const lmsSync = await pushEmployeeToLms(employee);

    return NextResponse.json(
      {
        ...employee,
        lmsSyncStatus: lmsSync.ok ? "synced" : "error",
        lmsSyncError: lmsSync.ok ? undefined : lmsSync.error,
        tempPassword: plainPassword === "password123" ? "password123" : undefined,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json({ error: "Failed to create employee" }, { status: 500 });
  }
}
