import { Division, Prisma, VisitStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sumDiscounts, sumLineItems } from "./totals";
import type { ScheduleFilters, VisitDTO } from "./types";

export const visitInclude = {
  customer: { select: { id: true, name: true, phone: true, email: true } },
  property: { select: { id: true, name: true, address: true } },
  serviceArea: { select: { id: true, name: true, color: true } },
  assignedUser: { select: { id: true, name: true, color: true, photoUrl: true } },
  crew: { select: { id: true, name: true, color: true } },
  lineItems: true,
  discounts: true,
} satisfies Prisma.VisitInclude;

export const visitDetailInclude = {
  ...visitInclude,
  timeEvents: { orderBy: { occurredAt: "asc" as const }, include: { user: { select: { id: true, name: true } } } },
  notes: {
    orderBy: { createdAt: "desc" as const },
    include: { author: { select: { id: true, name: true, photoUrl: true, color: true } } },
  },
  attachments: {
    orderBy: { createdAt: "desc" as const },
    include: { uploadedBy: { select: { id: true, name: true } } },
  },
  estimates: { select: { id: true, status: true, total: true, createdAt: true } },
} satisfies Prisma.VisitInclude;

type VisitPayload = Prisma.VisitGetPayload<{ include: typeof visitInclude }>;

export function serializeVisit(visit: VisitPayload): VisitDTO {
  const subtotal = sumLineItems(visit.lineItems ?? []);
  const discountTotal = sumDiscounts(subtotal, visit.discounts ?? []);
  return {
    id: visit.id,
    title: visit.title,
    startAt: visit.startAt.toISOString(),
    endAt: visit.endAt.toISOString(),
    division: visit.division,
    status: visit.status,
    tags: visit.tags,
    address: visit.address,
    city: visit.city,
    state: visit.state,
    zip: visit.zip,
    customer: visit.customer,
    property: visit.property,
    serviceArea: visit.serviceArea,
    assignedUser: visit.assignedUser,
    crew: visit.crew,
    subtotal,
    total: Math.max(0, subtotal - discountTotal),
  };
}

function buildVisitWhere(
  companyId: string,
  start: Date,
  end: Date,
  filters?: ScheduleFilters
): Prisma.VisitWhereInput {
  const where: Prisma.VisitWhereInput = {
    companyId,
    status: { not: VisitStatus.CANCELLED },
    startAt: { lt: end },
    endAt: { gt: start },
  };

  if (filters?.serviceAreaIds?.length) {
    where.serviceAreaId = { in: filters.serviceAreaIds };
  }
  if (filters?.userIds?.length) {
    where.assignedUserId = { in: filters.userIds };
  }
  if (filters?.crewIds?.length) {
    where.crewId = { in: filters.crewIds };
  }
  if (filters?.divisions?.length) {
    where.division = { in: filters.divisions as Division[] };
  }

  return where;
}

export async function listVisits(
  companyId: string,
  start: Date,
  end: Date,
  filters?: ScheduleFilters
) {
  const visits = await prisma.visit.findMany({
    where: buildVisitWhere(companyId, start, end, filters),
    include: visitInclude,
    orderBy: { startAt: "asc" },
  });
  return visits.map(serializeVisit);
}

export async function getScheduleSummary(companyId: string, start: Date, end: Date) {
  const visits = await prisma.visit.findMany({
    where: buildVisitWhere(companyId, start, end),
    include: { lineItems: true, discounts: true },
  });

  let revenue = 0;
  let totalMinutes = 0;

  for (const visit of visits) {
    const subtotal = sumLineItems(visit.lineItems);
    const discountTotal = sumDiscounts(subtotal, visit.discounts);
    revenue += Math.max(0, subtotal - discountTotal);
    totalMinutes += Math.max(0, (visit.endAt.getTime() - visit.startAt.getTime()) / 60000);
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);

  return {
    revenue,
    revenueFormatted: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(revenue),
    scheduledMinutes: totalMinutes,
    scheduledHoursFormatted: minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`,
  };
}

export async function getScheduleFilters(companyId: string) {
  const [serviceAreas, employees, crews] = await Promise.all([
    prisma.serviceArea.findMany({
      where: { companyId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, color: true, slug: true },
    }),
    prisma.user.findMany({
      where: { companyId, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true, photoUrl: true, division: true, role: true },
    }),
    prisma.crew.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, color: true, photoUrl: true } } },
        },
      },
    }),
  ]);

  return { serviceAreas, employees, crews };
}

export async function getVisitForCompany(companyId: string, visitId: string) {
  return prisma.visit.findFirst({
    where: { id: visitId, companyId },
    include: visitDetailInclude,
  });
}

export async function nextInvoiceNumber(companyId: string) {
  const count = await prisma.invoice.count({ where: { companyId } });
  return `INV-${String(count + 1).padStart(5, "0")}`;
}

export { serializeVisit as serializeJob, listVisits as listScheduleJobs, visitInclude as jobInclude };
