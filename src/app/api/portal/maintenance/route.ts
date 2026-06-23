import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/visits/totals";
import {
  requirePortalCustomer,
  portalForbiddenResponse,
  portalUnauthorizedResponse,
} from "@/lib/portal/auth";
import { portalFeatureEnabled } from "@/lib/portal/permissions";

export async function GET() {
  const ctx = await requirePortalCustomer();
  if (!ctx) return portalUnauthorizedResponse();
  if (!portalFeatureEnabled(ctx.company, "maintenance")) {
    return portalForbiddenResponse("Maintenance plans are not available in the portal");
  }

  const enrollments = await prisma.maintenancePlanEnrollment.findMany({
    where: { companyId: ctx.companyId, customerId: ctx.customerId },
    include: {
      template: { select: { id: true, name: true, basePrice: true } },
      property: { select: { id: true, name: true, address: true } },
      planVisits: {
        orderBy: [{ dueYear: "asc" }, { dueMonth: "asc" }],
        include: {
          visitTemplate: { select: { name: true, visitTitle: true, season: true } },
          visit: { select: { id: true, title: true, startAt: true, status: true } },
        },
      },
      billingPeriods: { orderBy: { dueDate: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    enrollments: enrollments.map((e) => ({
      id: e.id,
      status: e.status,
      startDate: e.startDate.toISOString(),
      endDate: e.endDate?.toISOString() ?? null,
      renewalDate: e.renewalDate?.toISOString() ?? null,
      billingFrequency: e.billingFrequency,
      template: {
        name: e.template.name,
        basePrice: toNumber(e.template.basePrice),
      },
      property: e.property,
      planVisits: e.planVisits.map((pv) => ({
        id: pv.id,
        status: pv.status,
        dueYear: pv.dueYear,
        dueMonth: pv.dueMonth,
        visitTemplate: pv.visitTemplate,
        visit: pv.visit
          ? {
              id: pv.visit.id,
              title: pv.visit.title,
              startAt: pv.visit.startAt?.toISOString() ?? null,
              status: pv.visit.status,
            }
          : null,
      })),
      billingPeriods: e.billingPeriods.map((bp) => ({
        id: bp.id,
        periodStart: bp.periodStart.toISOString(),
        periodEnd: bp.periodEnd.toISOString(),
        amount: toNumber(bp.amount),
        status: bp.status,
        dueDate: bp.dueDate.toISOString(),
        paidAt: bp.paidAt?.toISOString() ?? null,
      })),
    })),
  });
}
