import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { EmployeeStatus, UserRole } from "@prisma/client";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageEmployees, canSetEmployeePassword, employeeSelectFields, parseEmployeeNameFields, redactEmployeeForRole, resolveEmployeeDivision, validateEmployeePassword } from "@/lib/employees";
import { resolveCreateEmployeePay } from "@/lib/compensation/defaults";
import { pushEmployeeToLms } from "@/lib/integrations/lms-sync";
import { generateReviewNameAliases, REVIEW_ALIAS_ROLES } from "@/lib/google-business/review-aliases";
import { prisma } from "@/lib/prisma";
import { createAffiliateSignInLink } from "@/lib/affiliate/sign-in";

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

    return NextResponse.json(employees.map((employee) => redactEmployeeForRole(employee, user.role)));
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
    const employeeRole = (role as UserRole) ?? UserRole.CSR;

    if (!email) return badRequestResponse("Email is required");
    if (employeeRole !== UserRole.AFFILIATE && (!phone || !String(phone).trim())) {
      return badRequestResponse(
        "Mobile phone is required for SMS two-factor authentication",
      );
    }

    const nameFields = parseEmployeeNameFields({ firstName, lastName, name });
    if ("error" in nameFields) return badRequestResponse(nameFields.error);

    const existing = await prisma.user.findFirst({
      where: { companyId: user.companyId, email: String(email).toLowerCase() },
    });
    if (existing) return badRequestResponse("Email already in use at this company");

    const generatedPassword = body.password == null || String(body.password).length === 0;
    let plainPassword = generatedPassword ? randomBytes(18).toString("base64url") : "";
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
        onlineBookingEnabled:
          employeeRole === UserRole.AFFILIATE ? false : Boolean(body.onlineBookingEnabled),
        passwordHash,
        serviceAreas: serviceAreaIds?.length
          ? {
              create: serviceAreaIds.map((serviceAreaId: string) => ({ serviceAreaId })),
            }
          : undefined,
      },
      select: employeeSelectFields(),
    });

    const lmsSync = employee.role === UserRole.AFFILIATE
      ? null
      : await pushEmployeeToLms(employee);

    if (REVIEW_ALIAS_ROLES.includes(employee.role) && employee.firstName) {
      const aliases = await generateReviewNameAliases({
        companyId: user.companyId,
        userId: employee.id,
        firstName: employee.firstName,
      });
      if (aliases.length) {
        await prisma.user.update({
          where: { id: employee.id },
          data: { reviewNameAliases: aliases },
        });
      }
    }

    const refreshed = await prisma.user.findUnique({
      where: { id: employee.id },
      select: employeeSelectFields(),
    });

    let affiliateSignInUrl: string | undefined;
    let affiliateSignInExpiresAt: Date | undefined;
    if (employeeRole === UserRole.AFFILIATE) {
      try {
        const link = await createAffiliateSignInLink(employee.id, request.nextUrl.origin);
        affiliateSignInUrl = link.url;
        affiliateSignInExpiresAt = link.expiresAt;
      } catch (error) {
        console.error("Could not create initial affiliate sign-in link", {
          employeeId: employee.id,
          error,
        });
      }
    }

    return NextResponse.json(
      {
        ...(refreshed ?? employee),
        lmsSyncStatus: lmsSync ? (lmsSync.ok ? "synced" : "error") : null,
        lmsSyncError: lmsSync && !lmsSync.ok ? lmsSync.error : undefined,
        tempPassword:
          generatedPassword && employeeRole !== UserRole.AFFILIATE ? plainPassword : undefined,
        affiliateSignInUrl,
        affiliateSignInExpiresAt,
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
