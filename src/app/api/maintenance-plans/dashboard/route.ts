import { NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { requireCompanyMaintenancePlans } from "@/lib/maintenance-plans/feature";
import { getDashboard } from "@/lib/maintenance-plans/queries";
import { canViewMaintenancePlans } from "@/lib/maintenance-plans/permissions";

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (!canViewMaintenancePlans(user.role as UserRole)) return forbiddenResponse();
    await requireCompanyMaintenancePlans(user.companyId);

    const dashboard = await getDashboard(user.companyId);
    return NextResponse.json(dashboard);
  } catch (error) {
    if (error instanceof Error && error.message.includes("disabled")) {
      return forbiddenResponse(error.message);
    }
    return unauthorizedResponse();
  }
}
