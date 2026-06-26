import { Division, Prisma, VisitStatus } from "@prisma/client";
import { formatVisitEtaPayload } from "@/lib/maps/eta";
import { prisma } from "@/lib/prisma";
import { sumDiscounts, sumLineItems } from "./totals";
import type { ScheduleFilters, VisitDTO } from "./types";

export const visitInclude = {
  customer: {
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      address: true,
      city: true,
      state: true,
      zip: true,
      doNotService: true,
    },
  },
  property: {
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      state: true,
      zip: true,
      latitude: true,
      longitude: true,
      aerialImageUrl: true,
      propertyDiagramUrl: true,
      irrigationMapStatus: true,
    },
  },
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
  invoices: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      total: true,
      paidAt: true,
      publicToken: true,
      payments: { select: { amount: true, refundedAt: true } },
    },
  },
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
    isCallback: visit.isCallback,
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
    enRouteEtaSeconds: visit.enRouteEtaSeconds,
    enRouteEtaAt: visit.enRouteEtaAt?.toISOString() ?? null,
    enRouteCalculatedAt: visit.enRouteCalculatedAt?.toISOString() ?? null,
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

export type VisitListFilters = {
  search?: string;
  status?: VisitStatus;
};

export async function listVisitsForCompany(
  companyId: string,
  filters?: VisitListFilters
) {
  const where: Prisma.VisitWhereInput = { companyId };

  if (filters?.status) {
    where.status = filters.status;
  } else {
    where.status = { not: VisitStatus.CANCELLED };
  }

  if (filters?.search) {
    const q = filters.search;
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { customer: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  const visits = await prisma.visit.findMany({
    where,
    include: visitInclude,
    orderBy: { startAt: "desc" },
    take: 200,
  });
  return visits.map(serializeVisit);
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

export async function getScheduleSummary(
  companyId: string,
  start: Date,
  end: Date,
  filters?: ScheduleFilters
) {
  const visits = await prisma.visit.findMany({
    where: buildVisitWhere(companyId, start, end, filters),
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

export type VisitDetailRecord = NonNullable<Awaited<ReturnType<typeof getVisitForCompany>>>;

export async function resolveVisitProperty(visit: VisitDetailRecord) {
  if (visit.property) return visit.property;
  if (!visit.customerId) return null;

  return prisma.customerProperty.findFirst({
    where: { companyId: visit.companyId, customerId: visit.customerId },
    orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
    select: visitInclude.property.select,
  });
}

export async function serializeVisitDetail(
  visit: VisitDetailRecord,
  extras?: { etaWarning?: string }
) {
  const property = await resolveVisitProperty(visit);

  return {
    ...visit,
    property,
    startAt: visit.startAt.toISOString(),
    endAt: visit.endAt.toISOString(),
    enRouteEtaAt: visit.enRouteEtaAt?.toISOString() ?? null,
    enRouteCalculatedAt: visit.enRouteCalculatedAt?.toISOString() ?? null,
    enRouteOriginLat: visit.enRouteOriginLat ? Number(visit.enRouteOriginLat) : null,
    enRouteOriginLng: visit.enRouteOriginLng ? Number(visit.enRouteOriginLng) : null,
    eta: formatVisitEtaPayload(visit),
    ...(extras?.etaWarning ? { etaWarning: extras.etaWarning } : {}),
  };
}

export async function nextInvoiceNumber(companyId: string) {
  const count = await prisma.invoice.count({ where: { companyId } });
  return `INV-${String(count + 1).padStart(5, "0")}`;
}

export { serializeVisit as serializeJob, listVisits as listScheduleJobs, visitInclude as jobInclude };
