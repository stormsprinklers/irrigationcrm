import { NextResponse } from "next/server";
import { EmployeeStatus } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

/** Active employees with personal phones — for PSTN transfers. */
export async function GET() {
  try {
    const user = await requireSessionUser();
    const employees = await prisma.user.findMany({
      where: {
        companyId: user.companyId,
        status: EmployeeStatus.ACTIVE,
        phone: { not: null },
      },
      select: { id: true, name: true, phone: true, role: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({
      employees: employees.filter((e) => e.phone?.trim()),
    });
  } catch {
    return unauthorizedResponse();
  }
}
