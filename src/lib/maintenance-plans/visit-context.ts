import type { EnrollmentStatus, PlanVisitStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { applyPlanDiscountsToVisit } from "./discounts";
import { toNumber } from "@/lib/visits/totals";

const ACTIVE_ENROLLMENT_STATUSES: EnrollmentStatus[] = ["ACTIVE", "PENDING_RENEWAL", "EXPIRING_SOON"];
const ASSIGNABLE_PLAN_VISIT_STATUSES: PlanVisitStatus[] = ["UNSCHEDULED", "OVERDUE"];

export type VisitMaintenanceContext = {
  visitId: string;
  customerId: string | null;
  propertyId: string | null;
  linked: LinkedPlanVisit | null;
  enrollments: EnrollmentSummary[];
  assignablePlanVisits: AssignablePlanVisit[];
};

export type LinkedPlanVisit = {
  id: string;
  status: PlanVisitStatus;
  dueYear: number;
  dueMonth: number;
  visitTitle: string;
  season: string | null;
  enrollment: {
    id: string;
    status: EnrollmentStatus;
    templateName: string;
    propertyName: string;
  };
};

export type EnrollmentSummary = {
  id: string;
  status: EnrollmentStatus;
  templateName: string;
  propertyName: string;
  billingFrequency: string;
  basePrice: number;
  nextBillingDate: string | null;
  unscheduledVisitCount: number;
};

export type AssignablePlanVisit = {
  id: string;
  enrollmentId: string;
  visitTitle: string;
  dueYear: number;
  dueMonth: number;
  status: PlanVisitStatus;
  planName: string;
  propertyName: string;
};

export async function getVisitMaintenanceContext(
  companyId: string,
  visitId: string
): Promise<VisitMaintenanceContext | null> {
  const visit = await prisma.visit.findFirst({
    where: { id: visitId, companyId },
    select: {
      id: true,
      customerId: true,
      propertyId: true,
      maintenancePlanVisitId: true,
      maintenancePlanVisit: {
        include: {
          visitTemplate: { select: { visitTitle: true, season: true, name: true } },
          enrollment: {
            include: {
              template: { select: { name: true } },
              property: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!visit) return null;

  if (!visit.customerId) {
    return {
      visitId: visit.id,
      customerId: null,
      propertyId: visit.propertyId,
      linked: null,
      enrollments: [],
      assignablePlanVisits: [],
    };
  }

  const enrollmentWhere = {
    companyId,
    customerId: visit.customerId,
    status: { in: ACTIVE_ENROLLMENT_STATUSES },
    ...(visit.propertyId ? { propertyId: visit.propertyId } : {}),
  };

  const enrollmentRows = await prisma.maintenancePlanEnrollment.findMany({
    where: enrollmentWhere,
    orderBy: { createdAt: "desc" },
    include: {
      template: { select: { name: true, basePrice: true } },
      property: { select: { name: true } },
      planVisits: {
        where: { status: { in: ASSIGNABLE_PLAN_VISIT_STATUSES } },
        select: { id: true },
      },
    },
  });

  const enrollments: EnrollmentSummary[] = enrollmentRows.map((e) => ({
    id: e.id,
    status: e.status,
    templateName: e.template.name,
    propertyName: e.property.name,
    billingFrequency: e.billingFrequency,
    basePrice: toNumber(e.template.basePrice),
    nextBillingDate: e.nextBillingDate?.toISOString() ?? null,
    unscheduledVisitCount: e.planVisits.length,
  }));

  let linked: LinkedPlanVisit | null = null;
  if (visit.maintenancePlanVisit) {
    const pv = visit.maintenancePlanVisit;
    linked = {
      id: pv.id,
      status: pv.status,
      dueYear: pv.dueYear,
      dueMonth: pv.dueMonth,
      visitTitle: pv.visitTemplate?.visitTitle ?? pv.visitTemplate?.name ?? "Maintenance visit",
      season: pv.visitTemplate?.season ?? null,
      enrollment: {
        id: pv.enrollment.id,
        status: pv.enrollment.status,
        templateName: pv.enrollment.template.name,
        propertyName: pv.enrollment.property.name,
      },
    };
  }

  let assignablePlanVisits: AssignablePlanVisit[] = [];
  if (!visit.maintenancePlanVisitId && enrollmentRows.length > 0) {
    const rows = await prisma.maintenancePlanVisit.findMany({
      where: {
        enrollmentId: { in: enrollmentRows.map((e) => e.id) },
        status: { in: ASSIGNABLE_PLAN_VISIT_STATUSES },
      },
      orderBy: [{ dueYear: "asc" }, { dueMonth: "asc" }],
      include: {
        visitTemplate: { select: { visitTitle: true, name: true } },
        enrollment: {
          include: {
            template: { select: { name: true } },
            property: { select: { name: true } },
          },
        },
      },
    });

    assignablePlanVisits = rows.map((r) => ({
      id: r.id,
      enrollmentId: r.enrollmentId,
      visitTitle: r.visitTemplate?.visitTitle ?? r.visitTemplate?.name ?? "Maintenance visit",
      dueYear: r.dueYear,
      dueMonth: r.dueMonth,
      status: r.status,
      planName: r.enrollment.template.name,
      propertyName: r.enrollment.property.name,
    }));
  }

  return {
    visitId: visit.id,
    customerId: visit.customerId,
    propertyId: visit.propertyId,
    linked,
    enrollments,
    assignablePlanVisits,
  };
}

export async function linkVisitToPlanVisit(companyId: string, visitId: string, planVisitId: string) {
  const visit = await prisma.visit.findFirst({
    where: { id: visitId, companyId },
  });

  if (!visit) throw new Error("Visit not found");
  if (!visit.customerId) throw new Error("Visit must have a customer before linking a maintenance plan visit");
  if (visit.maintenancePlanVisitId) throw new Error("This visit is already linked to a maintenance plan visit");

  const planVisit = await prisma.maintenancePlanVisit.findFirst({
    where: {
      id: planVisitId,
      enrollment: { companyId, status: { in: ACTIVE_ENROLLMENT_STATUSES } },
    },
    include: { enrollment: true },
  });

  if (!planVisit) throw new Error("Maintenance plan visit not found");
  if (!ASSIGNABLE_PLAN_VISIT_STATUSES.includes(planVisit.status)) {
    throw new Error("That plan visit is no longer available to assign");
  }
  if (planVisit.enrollment.customerId !== visit.customerId) {
    throw new Error("Plan visit belongs to a different customer");
  }
  if (visit.propertyId && planVisit.enrollment.propertyId !== visit.propertyId) {
    throw new Error("Plan visit belongs to a different property");
  }

  const tags = visit.tags.includes("maintenance-plan") ? visit.tags : [...visit.tags, "maintenance-plan"];

  await prisma.$transaction([
    prisma.visit.update({
      where: { id: visitId },
      data: {
        maintenancePlanVisitId: planVisitId,
        propertyId: visit.propertyId ?? planVisit.enrollment.propertyId,
        tags,
      },
    }),
    prisma.maintenancePlanVisit.update({
      where: { id: planVisitId },
      data: { status: "SCHEDULED" },
    }),
  ]);

  await applyPlanDiscountsToVisit(visitId, planVisit.enrollmentId);

  return getVisitMaintenanceContext(companyId, visitId);
}
