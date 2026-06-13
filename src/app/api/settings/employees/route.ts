import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { EmployeeStatus, UserRole } from "@prisma/client";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageEmployees, employeeSelectFields } from "@/lib/employees";
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
      orderBy: [{ status: "asc" }, { name: "asc" }],
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
    const { name, email, phone, role, title, division, color, address, city, state, zip, birthDate, tags, serviceAreaIds } = body;

    if (!name || !email) return badRequestResponse("Name and email are required");

    const existing = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } });
    if (existing) return badRequestResponse("Email already in use");

    const passwordHash = await bcrypt.hash(body.password ?? "password123", 10);

    const employee = await prisma.user.create({
      data: {
        companyId: user.companyId,
        name: String(name),
        email: String(email).toLowerCase(),
        phone: phone ?? null,
        role: (role as UserRole) ?? UserRole.CSR,
        title: title ?? null,
        division: division ?? null,
        color: color ?? "#2563EB",
        address: address ?? null,
        city: city ?? null,
        state: state ?? null,
        zip: zip ?? null,
        birthDate: birthDate ? new Date(birthDate) : null,
        tags: Array.isArray(tags) ? tags : [],
        passwordHash,
        serviceAreas: serviceAreaIds?.length
          ? {
              create: serviceAreaIds.map((serviceAreaId: string) => ({ serviceAreaId })),
            }
          : undefined,
      },
      select: employeeSelectFields(),
    });

    return NextResponse.json(
      { ...employee, tempPassword: body.password ? undefined : "password123" },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json({ error: "Failed to create employee" }, { status: 500 });
  }
}
