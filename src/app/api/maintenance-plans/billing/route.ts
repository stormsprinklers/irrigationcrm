import { NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { listDueBilling } from "@/lib/maintenance-plans/queries";
import { canViewMaintenancePlans } from "@/lib/maintenance-plans/permissions";

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (!canViewMaintenancePlans(user.role as UserRole)) return forbiddenResponse();

    const billing = await listDueBilling(user.companyId);
    return NextResponse.json({ billing, total: billing.length });
  } catch {
    return unauthorizedResponse();
  }
}
