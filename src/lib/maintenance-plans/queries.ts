import type { EnrollmentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/visits/totals";
import {
  computeEnrollmentEndDate,
  computeNextBillingDate,
  computePeriodAmount,
  monthlyRecurringAmount,
} from "./billing";
import { generatePlanVisitRows } from "./visits";
import type {
  BillingPeriodDTO,
  DashboardDTO,
  EnrollmentDTO,
  MaintenancePlanTemplateDTO,
  PlanVisitDTO,
} from "./types";

const templateInclude = {
  visitTemplates: { orderBy: { sortOrder: "asc" as const } },
  addons: { orderBy: { sortOrder: "asc" as const } },
  discounts: true,
  _count: { select: { enrollments: true } },
} satisfies Prisma.MaintenancePlanTemplateInclude;

const enrollmentInclude = {
  customer: { select: { id: true, name: true, phone: true, email: true, doNotService: true } },
  property: { select: { id: true, name: true, address: true } },
  template: {
    select: {
      id: true,
      name: true,
      basePrice: true,
      cancellationFeeType: true,
      cancellationFeeAmount: true,
    },
  },
  planVisits: {
    orderBy: [{ dueYear: "asc" as const }, { dueMonth: "asc" as const }],
    include: {
      visitTemplate: true,
      visit: { select: { id: true, title: true, startAt: true } },
    },
  },
  billingPeriods: { orderBy: { dueDate: "asc" as const } },
} satisfies Prisma.MaintenancePlanEnrollmentInclude;

function serializeVisitTemplate(t: {
  id: string;
  name: string;
  season: MaintenancePlanTemplateDTO["visitTemplates"][0]["season"];
  defaultMonth: number;
  visitTitle: string;
  description: string | null;
  estimatedMinutes: number;
  sortOrder: number;
}) {
  return {
    id: t.id,
    name: t.name,
    season: t.season,
    defaultMonth: t.defaultMonth,
    visitTitle: t.visitTitle,
    description: t.description,
    estimatedMinutes: t.estimatedMinutes,
    sortOrder: t.sortOrder,
  };
}

export function serializeTemplate(
  t: Prisma.MaintenancePlanTemplateGetPayload<{ include: typeof templateInclude }>
): MaintenancePlanTemplateDTO {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    termsText: t.termsText,
    termsHtml: t.termsHtml,
    basePrice: toNumber(t.basePrice),
    active: t.active,
    durationType: t.durationType,
    durationYears: t.durationYears,
    allowedBillingFrequencies: t.allowedBillingFrequencies,
    autoRenewDefault: t.autoRenewDefault,
    cancellationFeeType: t.cancellationFeeType,
    cancellationFeeAmount: t.cancellationFeeAmount != null ? toNumber(t.cancellationFeeAmount) : null,
    cancellationNoticeDays: t.cancellationNoticeDays,
    benefits: t.benefits,
    stripeProductId: t.stripeProductId,
    visitTemplates: t.visitTemplates.map(serializeVisitTemplate),
    addons: t.addons.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      price: toNumber(a.price),
      active: a.active,
      sortOrder: a.sortOrder,
    })),
    discounts: t.discounts.map((d) => ({
      id: d.id,
      label: d.label,
      type: d.type,
      amount: toNumber(d.amount),
      appliesTo: d.appliesTo,
    })),
    enrollmentCount: t._count.enrollments,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export function serializeEnrollment(
  e: Prisma.MaintenancePlanEnrollmentGetPayload<{ include: typeof enrollmentInclude }>
): EnrollmentDTO {
  return {
    id: e.id,
    status: e.status,
    billingFrequency: e.billingFrequency,
    startDate: e.startDate.toISOString(),
    endDate: e.endDate?.toISOString() ?? null,
    nextBillingDate: e.nextBillingDate?.toISOString() ?? null,
    renewalDate: e.renewalDate?.toISOString() ?? null,
    autoRenew: e.autoRenew,
    acceptedAt: e.acceptedAt?.toISOString() ?? null,
    cancelledAt: e.cancelledAt?.toISOString() ?? null,
    cancellationReason: e.cancellationReason,
    cancellationFeeCharged:
      e.cancellationFeeCharged != null ? toNumber(e.cancellationFeeCharged) : null,
    customer: e.customer,
    property: e.property,
    template: {
      id: e.template.id,
      name: e.template.name,
      basePrice: toNumber(e.template.basePrice),
      cancellationFeeType: e.template.cancellationFeeType,
      cancellationFeeAmount:
        e.template.cancellationFeeAmount != null
          ? toNumber(e.template.cancellationFeeAmount)
          : null,
    },
    planVisits: e.planVisits.map(
      (pv): PlanVisitDTO => ({
        id: pv.id,
        dueYear: pv.dueYear,
        dueMonth: pv.dueMonth,
        status: pv.status,
        completedAt: pv.completedAt?.toISOString() ?? null,
        visitTemplate: pv.visitTemplate ? serializeVisitTemplate(pv.visitTemplate) : null,
        visit: pv.visit
          ? { id: pv.visit.id, title: pv.visit.title, startAt: pv.visit.startAt.toISOString() }
          : null,
      })
    ),
    billingPeriods: e.billingPeriods.map(
      (bp): BillingPeriodDTO => ({
        id: bp.id,
        periodStart: bp.periodStart.toISOString(),
        periodEnd: bp.periodEnd.toISOString(),
        amount: toNumber(bp.amount),
        status: bp.status,
        dueDate: bp.dueDate.toISOString(),
        paidAt: bp.paidAt?.toISOString() ?? null,
        invoiceId: bp.invoiceId,
      })
    ),
  };
}

export async function listTemplates(companyId: string) {
  const rows = await prisma.maintenancePlanTemplate.findMany({
    where: { companyId },
    orderBy: { name: "asc" },
    include: templateInclude,
  });
  return rows.map(serializeTemplate);
}

export async function getTemplate(companyId: string, id: string) {
  const row = await prisma.maintenancePlanTemplate.findFirst({
    where: { id, companyId },
    include: templateInclude,
  });
  return row ? serializeTemplate(row) : null;
}

export async function getEnrollment(companyId: string, id: string) {
  const row = await prisma.maintenancePlanEnrollment.findFirst({
    where: { id, companyId },
    include: enrollmentInclude,
  });
  return row ? serializeEnrollment(row) : null;
}

export async function listEnrollments(
  companyId: string,
  filters?: { customerId?: string; propertyId?: string; status?: string }
) {
  const where: Prisma.MaintenancePlanEnrollmentWhereInput = { companyId };
  if (filters?.customerId) where.customerId = filters.customerId;
  if (filters?.propertyId) where.propertyId = filters.propertyId;
  if (filters?.status) where.status = filters.status as EnrollmentStatus;

  const rows = await prisma.maintenancePlanEnrollment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: enrollmentInclude,
  });
  return rows.map(serializeEnrollment);
}

export async function activateEnrollment(companyId: string, enrollmentId: string) {
  const enrollment = await prisma.maintenancePlanEnrollment.findFirst({
    where: { id: enrollmentId, companyId },
    include: { template: { include: { visitTemplates: { orderBy: { sortOrder: "asc" } } } } },
  });
  if (!enrollment) return null;

  const startDate = enrollment.startDate;
  const endDate = computeEnrollmentEndDate(
    startDate,
    enrollment.template.durationType,
    enrollment.template.durationYears,
    enrollment.billingFrequency
  );
  const nextBillingDate = computeNextBillingDate(startDate, enrollment.billingFrequency);
  const planYear = startDate.getFullYear();
  const periodAmount = computePeriodAmount(
    toNumber(enrollment.template.basePrice),
    enrollment.billingFrequency,
    enrollment.template.durationYears
  );

  const visitRows = generatePlanVisitRows(enrollment.template.visitTemplates, planYear);

  await prisma.$transaction([
    prisma.maintenancePlanEnrollment.update({
      where: { id: enrollmentId },
      data: {
        status: "ACTIVE",
        acceptedAt: new Date(),
        endDate,
        nextBillingDate,
        renewalDate: endDate,
      },
    }),
    prisma.maintenancePlanVisit.createMany({
      data: visitRows.map((v) => ({ enrollmentId, ...v })),
    }),
    prisma.maintenancePlanBillingPeriod.create({
      data: {
        enrollmentId,
        periodStart: startDate,
        periodEnd: nextBillingDate,
        amount: periodAmount,
        status: "DUE",
        dueDate: startDate,
      },
    }),
  ]);

  return getEnrollment(companyId, enrollmentId);
}

export async function getDashboard(companyId: string): Promise<DashboardDTO> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  const [statusGroups, paidAllTime, paidThisMonth, paidLastMonth, activeEnrollments, unscheduledCount, dueBillingCount, templates] =
    await Promise.all([
      prisma.maintenancePlanEnrollment.groupBy({
        by: ["status"],
        where: { companyId },
        _count: true,
      }),
      prisma.maintenancePlanBillingPeriod.aggregate({
        where: { enrollment: { companyId }, status: "PAID" },
        _sum: { amount: true },
      }),
      prisma.maintenancePlanBillingPeriod.aggregate({
        where: {
          enrollment: { companyId },
          status: "PAID",
          paidAt: { gte: monthStart },
        },
        _sum: { amount: true },
      }),
      prisma.maintenancePlanBillingPeriod.aggregate({
        where: {
          enrollment: { companyId },
          status: "PAID",
          paidAt: { gte: lastMonthStart, lte: lastMonthEnd },
        },
        _sum: { amount: true },
      }),
      prisma.maintenancePlanEnrollment.findMany({
        where: { companyId, status: "ACTIVE" },
        include: { template: true },
      }),
      prisma.maintenancePlanVisit.count({
        where: {
          enrollment: { companyId, status: "ACTIVE" },
          status: { in: ["UNSCHEDULED", "OVERDUE"] },
        },
      }),
      prisma.maintenancePlanBillingPeriod.count({
        where: {
          enrollment: { companyId, status: "ACTIVE" },
          status: { in: ["DUE", "FAILED"] },
        },
      }),
      prisma.maintenancePlanTemplate.findMany({
        where: { companyId, active: true },
        select: { id: true, name: true, basePrice: true, active: true },
        orderBy: { name: "asc" },
      }),
    ]);

  const mrr = activeEnrollments.reduce((sum, e) => {
    return (
      sum +
      monthlyRecurringAmount(
        toNumber(e.template.basePrice),
        e.billingFrequency,
        e.template.durationYears
      )
    );
  }, 0);

  const thisMonth = toNumber(paidThisMonth._sum.amount);
  const lastMonth = toNumber(paidLastMonth._sum.amount);
  const trend =
    lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 10000) / 100 : null;

  const monthLabels = Array.from({ length: 4 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (3 - i), 1);
    return d.toLocaleString("en-US", { month: "long" });
  });

  return {
    summary: {
      totalEnrollments: statusGroups.reduce((s, g) => s + g._count, 0),
      revenueAllTime: toNumber(paidAllTime._sum.amount),
      statuses: statusGroups.map((g) => ({ status: g.status, count: g._count })),
    },
    recurringRevenue: monthLabels.map((month) => ({ month, amount: mrr })),
    revenueCollectedThisMonth: thisMonth,
    revenueTrendPercent: trend,
    unscheduledVisitCount: unscheduledCount,
    dueBillingCount: dueBillingCount,
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      basePrice: toNumber(t.basePrice),
      active: t.active,
    })),
  };
}

export async function listDueBilling(companyId: string) {
  const rows = await prisma.maintenancePlanBillingPeriod.findMany({
    where: {
      enrollment: { companyId },
      status: { in: ["DUE", "FAILED"] },
    },
    orderBy: { dueDate: "asc" },
    include: {
      enrollment: {
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          template: { select: { name: true } },
        },
      },
    },
    take: 50,
  });

  return rows.map((r) => ({
    id: r.id,
    enrollmentId: r.enrollmentId,
    customer: r.enrollment.customer.name,
    phone: r.enrollment.customer.phone,
    planName: r.enrollment.template.name,
    dueDate: r.dueDate.toISOString(),
    status: r.status,
    amount: toNumber(r.amount),
  }));
}

export async function listUnscheduledVisits(companyId: string) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  await prisma.maintenancePlanVisit.updateMany({
    where: {
      enrollment: { companyId, status: "ACTIVE" },
      status: "UNSCHEDULED",
      OR: [{ dueYear: { lt: year } }, { dueYear: year, dueMonth: { lt: month } }],
    },
    data: { status: "OVERDUE" },
  });

  const rows = await prisma.maintenancePlanVisit.findMany({
    where: {
      enrollment: { companyId, status: "ACTIVE" },
      status: { in: ["UNSCHEDULED", "OVERDUE"] },
    },
    orderBy: [{ dueYear: "asc" }, { dueMonth: "asc" }],
    include: {
      visitTemplate: true,
      enrollment: {
        include: {
          customer: { select: { id: true, name: true, doNotService: true } },
          property: { select: { id: true, name: true, address: true, zip: true } },
        },
      },
    },
    take: 50,
  });

  return rows.map((r) => ({
    id: r.id,
    enrollmentId: r.enrollmentId,
    customer: r.enrollment.customer.name,
    customerDoNotService: r.enrollment.customer.doNotService,
    property: r.enrollment.property.name,
    visitTitle: r.visitTemplate?.visitTitle ?? "Maintenance visit",
    dueMonth: r.dueMonth,
    dueYear: r.dueYear,
    status: r.status,
    zip: r.enrollment.property.zip,
  }));
}
