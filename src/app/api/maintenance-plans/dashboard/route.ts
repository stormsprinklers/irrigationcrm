import { NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getDashboard } from "@/lib/maintenance-plans/queries";
import { canViewMaintenancePlans } from "@/lib/maintenance-plans/permissions";

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (!canViewMaintenancePlans(user.role as UserRole)) return forbiddenResponse();

    const dashboard = await getDashboard(user.companyId);
    return NextResponse.json(dashboard);
  } catch {
    return unauthorizedResponse();
  }
}
