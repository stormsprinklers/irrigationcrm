import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getEnrollment } from "@/lib/maintenance-plans/queries";
import { canManageEnrollments } from "@/lib/maintenance-plans/permissions";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageEnrollments(user.role as UserRole)) return forbiddenResponse();

    const { id } = await params;
    const existing = await prisma.maintenancePlanEnrollment.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.status !== "ACTIVE" && existing.status !== "EXPIRING_SOON") {
      return badRequestResponse("Only active enrollments can be renewed");
    }

    await prisma.maintenancePlanEnrollment.update({
      where: { id },
      data: { status: "PENDING_RENEWAL" },
    });

    const enrollment = await getEnrollment(user.companyId, id);
    return NextResponse.json(enrollment);
  } catch {
    return unauthorizedResponse();
  }
}
