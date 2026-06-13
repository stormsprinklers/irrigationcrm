import { Division, JobStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ScheduleFilters, ScheduleJobDTO } from "./types";

const jobInclude = {
  customer: { select: { id: true, name: true } },
  serviceArea: { select: { id: true, name: true, color: true } },
  assignedUser: { select: { id: true, name: true, color: true, photoUrl: true } },
  crew: { select: { id: true, name: true, color: true } },
} satisfies Prisma.ScheduledJobInclude;

function serializeJob(job: Prisma.ScheduledJobGetPayload<{ include: typeof jobInclude }>): ScheduleJobDTO {
  return {
    id: job.id,
    title: job.title,
    startAt: job.startAt.toISOString(),
    endAt: job.endAt.toISOString(),
    division: job.division,
    status: job.status,
    notes: job.notes,
    address: job.address,
    city: job.city,
    state: job.state,
    zip: job.zip,
    estimatedValue: job.estimatedValue ? Number(job.estimatedValue) : null,
    customer: job.customer,
    serviceArea: job.serviceArea,
    assignedUser: job.assignedUser,
    crew: job.crew,
  };
}

function buildJobWhere(
  companyId: string,
  start: Date,
  end: Date,
  filters?: ScheduleFilters
): Prisma.ScheduledJobWhereInput {
  const where: Prisma.ScheduledJobWhereInput = {
    companyId,
    status: { not: JobStatus.CANCELLED },
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

export async function listScheduleJobs(
  companyId: string,
  start: Date,
  end: Date,
  filters?: ScheduleFilters
) {
  const jobs = await prisma.scheduledJob.findMany({
    where: buildJobWhere(companyId, start, end, filters),
    include: jobInclude,
    orderBy: { startAt: "asc" },
  });
  return jobs.map(serializeJob);
}

export async function getScheduleSummary(companyId: string, start: Date, end: Date) {
  const jobs = await prisma.scheduledJob.findMany({
    where: buildJobWhere(companyId, start, end),
    select: { startAt: true, endAt: true, estimatedValue: true },
  });

  let revenue = 0;
  let totalMinutes = 0;

  for (const job of jobs) {
    revenue += job.estimatedValue ? Number(job.estimatedValue) : 0;
    totalMinutes += Math.max(0, (job.endAt.getTime() - job.startAt.getTime()) / 60000);
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);

  return {
    revenue,
    revenueFormatted: new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(revenue),
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

export { serializeJob, jobInclude };
