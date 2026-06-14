import { NextRequest, NextResponse } from "next/server";
import { PayType, UserRole } from "@prisma/client";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canDeleteEmployee, canManageEmployees, employeeSelectFields } from "@/lib/employees";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;

    const employee = await prisma.user.findFirst({
      where: { id, companyId: user.companyId },
      select: employeeSelectFields(),
    });
    if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json(employee);
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageEmployees(user.role)) return forbiddenResponse();

    const { id } = await params;
    const existing = await prisma.user.findFirst({ where: { id, companyId: user.companyId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const { serviceAreaIds, ...fields } = body;

    if (fields.email && fields.email !== existing.email) {
      const dup = await prisma.user.findUnique({ where: { email: String(fields.email).toLowerCase() } });
      if (dup) return badRequestResponse("Email already in use");
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          ...(fields.name !== undefined ? { name: String(fields.name) } : {}),
          ...(fields.email !== undefined ? { email: String(fields.email).toLowerCase() } : {}),
          ...(fields.phone !== undefined ? { phone: fields.phone ?? null } : {}),
          ...(fields.role !== undefined ? { role: fields.role as UserRole } : {}),
          ...(fields.title !== undefined ? { title: fields.title ?? null } : {}),
          ...(fields.division !== undefined ? { division: fields.division ?? null } : {}),
          ...(fields.color !== undefined ? { color: fields.color ?? null } : {}),
          ...(fields.photoUrl !== undefined ? { photoUrl: fields.photoUrl ?? null } : {}),
          ...(fields.address !== undefined ? { address: fields.address ?? null } : {}),
          ...(fields.city !== undefined ? { city: fields.city ?? null } : {}),
          ...(fields.state !== undefined ? { state: fields.state ?? null } : {}),
          ...(fields.zip !== undefined ? { zip: fields.zip ?? null } : {}),
          ...(fields.birthDate !== undefined
            ? { birthDate: fields.birthDate ? new Date(fields.birthDate) : null }
            : {}),
          ...(fields.tags !== undefined ? { tags: Array.isArray(fields.tags) ? fields.tags : [] } : {}),
          ...(fields.payType !== undefined
            ? { payType: fields.payType ? (fields.payType as PayType) : null }
            : {}),
          ...(fields.hourlyRate !== undefined
            ? { hourlyRate: fields.hourlyRate != null ? Number(fields.hourlyRate) : null }
            : {}),
          ...(fields.commissionPercent !== undefined
            ? {
                commissionPercent:
                  fields.commissionPercent != null ? Number(fields.commissionPercent) : null,
              }
            : {}),
          ...(fields.annualSalary !== undefined
            ? { annualSalary: fields.annualSalary != null ? Number(fields.annualSalary) : null }
            : {}),
        },
      });

      if (Array.isArray(serviceAreaIds)) {
        await tx.userServiceArea.deleteMany({ where: { userId: id } });
        if (serviceAreaIds.length) {
          await tx.userServiceArea.createMany({
            data: serviceAreaIds.map((serviceAreaId: string) => ({ userId: id, serviceAreaId })),
          });
        }
      }
    });

    const employee = await prisma.user.findUnique({
      where: { id },
      select: employeeSelectFields(),
    });

    return NextResponse.json(employee);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json({ error: "Failed to update employee" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canDeleteEmployee(user.role)) return forbiddenResponse();

    const { id } = await params;
    if (id === user.id) return badRequestResponse("Cannot delete your own account");

    const existing = await prisma.user.findFirst({ where: { id, companyId: user.companyId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const futureJobs = await prisma.visit.count({
      where: {
        assignedUserId: id,
        startAt: { gt: new Date() },
        status: { not: "CANCELLED" },
      },
    });
    if (futureJobs > 0) {
      return badRequestResponse("Employee has future scheduled jobs. Archive instead.");
    }

    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json({ error: "Failed to delete employee" }, { status: 500 });
  }
}
