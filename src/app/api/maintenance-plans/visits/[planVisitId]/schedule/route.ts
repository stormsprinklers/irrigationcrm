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

type Params = { params: Promise<{ planVisitId: string }> };

function firstWeekdayOfMonth(year: number, month: number): Date {
  const date = new Date(year, month - 1, 1, 9, 0, 0, 0);
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() + 1);
  }
  return date;
}

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
    if (!serviceAreaId) return badRequestResponse("serviceAreaId or property zip is required");

    const block = await getCustomerServiceBlock(user.companyId, planVisit.enrollment.customerId);
    if (block) return badRequestResponse(block);

    const title = planVisit.visitTemplate?.visitTitle ?? "Maintenance visit";
    const startAt = body.startAt
      ? new Date(body.startAt)
      : firstWeekdayOfMonth(planVisit.dueYear, planVisit.dueMonth);
    const endAt = body.endAt
      ? new Date(body.endAt)
      : new Date(startAt.getTime() + 2 * 60 * 60 * 1000);

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
          serviceAreaId,
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

    return NextResponse.json(visit, { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
