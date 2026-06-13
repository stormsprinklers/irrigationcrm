import { NextRequest, NextResponse } from "next/server";
import type { BillingFrequency, UserRole } from "@prisma/client";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getEnrollment } from "@/lib/maintenance-plans/queries";
import { canManageEnrollments, canViewMaintenancePlans } from "@/lib/maintenance-plans/permissions";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canViewMaintenancePlans(user.role as UserRole)) return forbiddenResponse();

    const { id } = await params;
    const enrollment = await getEnrollment(user.companyId, id);
    if (!enrollment) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(enrollment);
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageEnrollments(user.role as UserRole)) return forbiddenResponse();

    const { id } = await params;
    const existing = await prisma.maintenancePlanEnrollment.findFirst({
      where: { id, companyId: user.companyId },
      include: { template: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.status !== "DRAFT" && existing.status !== "SENT") {
      return badRequestResponse("Only draft or sent enrollments can be updated");
    }

    const body = await request.json();

    if (body.billingFrequency !== undefined) {
      const frequency = body.billingFrequency as BillingFrequency;
      if (!existing.template.allowedBillingFrequencies.includes(frequency)) {
        return badRequestResponse("billingFrequency is not allowed for this template");
      }
    }

    if (body.selectedAddonIds !== undefined && Array.isArray(body.selectedAddonIds)) {
      const addonCount = await prisma.maintenancePlanAddon.count({
        where: {
          templateId: existing.templateId,
          id: { in: body.selectedAddonIds },
          active: true,
        },
      });
      if (addonCount !== body.selectedAddonIds.length) {
        return badRequestResponse("One or more selected addons are invalid");
      }
    }

    await prisma.maintenancePlanEnrollment.update({
      where: { id },
      data: {
        ...(body.billingFrequency !== undefined ? { billingFrequency: body.billingFrequency as BillingFrequency } : {}),
        ...(body.startDate !== undefined ? { startDate: new Date(body.startDate) } : {}),
        ...(body.autoRenew !== undefined ? { autoRenew: Boolean(body.autoRenew) } : {}),
        ...(body.selectedAddonIds !== undefined
          ? { selectedAddonIds: Array.isArray(body.selectedAddonIds) ? body.selectedAddonIds : [] }
          : {}),
        ...(body.propertyId !== undefined ? { propertyId: body.propertyId } : {}),
      },
    });

    const enrollment = await getEnrollment(user.companyId, id);
    return NextResponse.json(enrollment);
  } catch {
    return unauthorizedResponse();
  }
}
