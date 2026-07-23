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
    if (existing.status === "CANCELLED") {
      return badRequestResponse("Cancelled enrollments cannot be updated");
    }

    const body = await request.json();

    const updatingCoreFields =
      body.billingFrequency !== undefined ||
      body.startDate !== undefined ||
      body.autoRenew !== undefined ||
      body.propertyId !== undefined;
    const updatingAddonsOnly =
      body.selectedAddonIds !== undefined && !updatingCoreFields;

    // Full edits stay draft/sent-only; add-on remove/adjust is allowed on active plans.
    if (updatingCoreFields && existing.status !== "DRAFT" && existing.status !== "SENT") {
      return badRequestResponse("Only draft or sent enrollments can be updated");
    }
    if (!updatingAddonsOnly && !updatingCoreFields && body.selectedAddonIds === undefined) {
      return badRequestResponse("No changes provided");
    }

    if (body.billingFrequency !== undefined) {
      const frequency = body.billingFrequency as BillingFrequency;
      if (!existing.template.allowedBillingFrequencies.includes(frequency)) {
        return badRequestResponse("billingFrequency is not allowed for this template");
      }
    }

    if (body.selectedAddonIds !== undefined) {
      if (!Array.isArray(body.selectedAddonIds)) {
        return badRequestResponse("selectedAddonIds must be an array");
      }
      const ids = body.selectedAddonIds.map((v: unknown) => String(v));
      if (ids.length) {
        const addonCount = await prisma.maintenancePlanAddon.count({
          where: {
            templateId: existing.templateId,
            id: { in: ids },
          },
        });
        if (addonCount !== ids.length) {
          return badRequestResponse("One or more selected addons are invalid");
        }
      }
      body.selectedAddonIds = ids;
    }

    await prisma.maintenancePlanEnrollment.update({
      where: { id },
      data: {
        ...(body.billingFrequency !== undefined
          ? { billingFrequency: body.billingFrequency as BillingFrequency }
          : {}),
        ...(body.startDate !== undefined ? { startDate: new Date(body.startDate) } : {}),
        ...(body.autoRenew !== undefined ? { autoRenew: Boolean(body.autoRenew) } : {}),
        ...(body.selectedAddonIds !== undefined ? { selectedAddonIds: body.selectedAddonIds } : {}),
        ...(body.propertyId !== undefined ? { propertyId: body.propertyId } : {}),
      },
    });

    const enrollment = await getEnrollment(user.companyId, id);
    return NextResponse.json(enrollment);
  } catch {
    return unauthorizedResponse();
  }
}
