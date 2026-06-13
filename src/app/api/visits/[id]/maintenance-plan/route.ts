import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageEnrollments, canViewMaintenancePlans } from "@/lib/maintenance-plans/permissions";
import { getVisitMaintenanceContext, linkVisitToPlanVisit } from "@/lib/maintenance-plans/visit-context";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canViewMaintenancePlans(user.role as UserRole)) return forbiddenResponse();

    const { id } = await params;
    const context = await getVisitMaintenanceContext(user.companyId, id);
    if (!context) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json(context);
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageEnrollments(user.role as UserRole)) return forbiddenResponse();

    const { id } = await params;
    const body = await request.json();
    if (!body.planVisitId) return badRequestResponse("planVisitId is required");

    try {
      const context = await linkVisitToPlanVisit(user.companyId, id, body.planVisitId);
      return NextResponse.json(context);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to link maintenance plan visit";
      return badRequestResponse(message);
    }
  } catch {
    return unauthorizedResponse();
  }
}
