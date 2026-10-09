import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { Division, VisitStatus } from "@prisma/client";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getCustomerServiceBlock } from "@/lib/customers/service-guard";
import { canManageEnrollments } from "@/lib/maintenance-plans/permissions";
import { applyPlanDiscountsToVisit } from "@/lib/maintenance-plans/discounts";
import { syncVisitChecklists } from "@/lib/checklists/apply";
import { onVisitTimeChanged } from "@/lib/notifications/visit-events";
import { prisma } from "@/lib/prisma";
import { resolveServiceAreaByZip } from "@/lib/service-areas";
import { validateScheduledVisitAssignment } from "@/lib/schedule/visit-assignment";
import { validateAssignmentUpdate } from "@/lib/schedule/time-off";

type Params = { params: Promise<{ planVisitId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageEnrollments(user.role as UserRole)) return forbiddenResponse();

    const { planVisitId } = await params;
    const planVisit = await prisma.maintenancePlanVisit.findFirst({
      where: {
        id: planVisitId,
        enrollment: { companyId: user.companyId },
      },
      include: {
        visitTemplate: true,
        enrollment: {
          include: {
            property: true,
            customer: true,
          },
        },
      },
    });

    if (!planVisit) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (planVisit.status === "SCHEDULED" || planVisit.status === "COMPLETED") {
      return badRequestResponse("Plan visit is already scheduled or completed");
    }

    const body = await request.json().catch(() => ({}));
    const property = planVisit.enrollment.property;
    const zip = property.zip ?? planVisit.enrollment.customer.zip;

    let serviceAreaId = body.serviceAreaId as string | undefined;
    if (!serviceAreaId && zip) {
      const area = await resolveServiceAreaByZip(user.companyId, String(zip));
      serviceAreaId = area?.id;
    }

    const block = await getCustomerServiceBlock(user.companyId, planVisit.enrollment.customerId);
    if (block) return badRequestResponse(block);

    const title = planVisit.visitTemplate?.visitTitle ?? "Maintenance visit";
    if (!body.startAt || !body.endAt) {
      return badRequestResponse("Choose a date and time before scheduling this visit");
    }
    const startAt = new Date(body.startAt);
    const endAt = new Date(body.endAt);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      return badRequestResponse("Enter a valid date and time");
    }
    if (endAt <= startAt) {
      return badRequestResponse("End time must be after start time");
    }

    const assignedUserId = body.assignedUserId as string | undefined;
    const assignmentError = validateScheduledVisitAssignment(VisitStatus.SCHEDULED, assignedUserId);
    if (assignmentError) return badRequestResponse(assignmentError);

    const availability = await validateAssignmentUpdate(
      user.companyId,
      assignedUserId ?? null,
      startAt,
      endAt
    );
    if (availability.error) return badRequestResponse(availability.error);

    const visit = await prisma.$transaction(async (tx) => {
      const created = await tx.visit.create({
        data: {
          companyId: user.companyId,
          customerId: planVisit.enrollment.customerId,
          propertyId: planVisit.enrollment.propertyId,
          title,
          startAt,
          endAt,
          division: Division.SERVICE,
          serviceAreaId: serviceAreaId ?? null,
          assignedUserId: assignedUserId ?? null,
          status: VisitStatus.SCHEDULED,
          tags: ["maintenance-plan"],
          address: property.address ?? null,
          city: property.city ?? null,
          state: property.state ?? null,
          zip: property.zip ?? null,
          maintenancePlanVisitId: planVisitId,
        },
      });

      await tx.maintenancePlanVisit.update({
        where: { id: planVisitId },
        data: { status: "SCHEDULED" },
      });

      return created;
    });

    await applyPlanDiscountsToVisit(visit.id, planVisit.enrollmentId);
    await syncVisitChecklists(visit.id, user.companyId);

    void onVisitTimeChanged({
      visitId: visit.id,
      companyId: user.companyId,
      isInitialSchedule: true,
    }).catch(() => {});

    return NextResponse.json({ ...visit, warning: availability.warning }, { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
