import { NextRequest, NextResponse } from "next/server";
import { EmployeeStatus } from "@prisma/client";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageEmployees, employeeSelectFields } from "@/lib/employees";
import { pushEmployeeToLms } from "@/lib/integrations/lms-sync";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageEmployees(user.role)) return forbiddenResponse();

    const { id } = await params;
    const body = await request.json();
    const action = body.action === "restore" ? "restore" : "archive";

    const existing = await prisma.user.findFirst({ where: { id, companyId: user.companyId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const employee = await prisma.user.update({
      where: { id },
      data: {
        status: action === "restore" ? EmployeeStatus.ACTIVE : EmployeeStatus.ARCHIVED,
      },
      select: employeeSelectFields(),
    });

    const lmsSync = await pushEmployeeToLms(employee);

    return NextResponse.json({
      ...employee,
      lmsSyncStatus: lmsSync.ok ? "synced" : "error",
      lmsSyncError: lmsSync.ok ? undefined : lmsSync.error,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json({ error: "Failed to update employee status" }, { status: 500 });
  }
}
