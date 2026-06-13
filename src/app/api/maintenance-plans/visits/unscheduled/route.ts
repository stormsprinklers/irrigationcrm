import { NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { listUnscheduledVisits } from "@/lib/maintenance-plans/queries";
import { canViewMaintenancePlans } from "@/lib/maintenance-plans/permissions";

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (!canViewMaintenancePlans(user.role as UserRole)) return forbiddenResponse();

    const visits = await listUnscheduledVisits(user.companyId);
    return NextResponse.json({ visits, total: visits.length });
  } catch {
    return unauthorizedResponse();
  }
}
