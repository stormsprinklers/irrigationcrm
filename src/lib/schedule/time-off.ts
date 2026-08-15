import { TimeOffStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { defaultEmployeeWorkSchedule, toMinutes } from "@/lib/schedule/open-time-slots";
import type { TimeOffRequestDTO, WorkScheduleDayDTO } from "@/lib/schedule/time-off-types";
import { localTimeParts } from "@/lib/voice/hours-branch";

export type { TimeOffRequestDTO, WorkScheduleDayDTO } from "@/lib/schedule/time-off-types";

export type AssignmentAvailability = {
  error: string | null;
  warning: string | null;
};

const OFFICE_ROLES = new Set(["ADMIN", "MANAGER", "CSR"]);

export function canManageTeamSchedule(role: string) {
  return OFFICE_ROLES.has(role);
}

export function canReviewTimeOff(role: string) {
  return OFFICE_ROLES.has(role);
}

type TimeOffPayload = {
  id: string;
  userId: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  type: string;
  status: string;
  reason: string | null;
  reviewNotes: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  user: { name: string };
  reviewedBy: { name: string } | null;
  createdBy: { name: string };
};

export function serializeTimeOffRequest(entry: TimeOffPayload): TimeOffRequestDTO {
  return {
    id: entry.id,
    userId: entry.userId,
    userName: entry.user.name,
    startAt: entry.startAt.toISOString(),
    endAt: entry.endAt.toISOString(),
    allDay: entry.allDay,
    type: entry.type,
    status: entry.status,
    reason: entry.reason,
    reviewNotes: entry.reviewNotes,
    reviewedByName: entry.reviewedBy?.name ?? null,
    reviewedAt: entry.reviewedAt?.toISOString() ?? null,
    createdByName: entry.createdBy.name,
    createdAt: entry.createdAt.toISOString(),
  };
}

const timeOffInclude = {
  user: { select: { name: true } },
  reviewedBy: { select: { name: true } },
  createdBy: { select: { name: true } },
} as const;

export async function listTimeOffRequests(
  companyId: string,
  options: {
    start?: Date;
    end?: Date;
    userId?: string;
    status?: TimeOffStatus;
  }
) {
  const where: {
    companyId: string;
    userId?: string;
    status?: TimeOffStatus;
    startAt?: { lt: Date };
    endAt?: { gt: Date };
  } = { companyId };

  if (options.userId) where.userId = options.userId;
  if (options.status) where.status = options.status;
  if (options.start && options.end) {
    where.startAt = { lt: options.end };
    where.endAt = { gt: options.start };
  }

  const rows = await prisma.timeOffRequest.findMany({
    where,
    include: timeOffInclude,
    orderBy: { startAt: "asc" },
  });

  return rows.map(serializeTimeOffRequest);
}

export async function getEmployeeWorkSchedule(companyId: string, userId: string) {
  const rows = await prisma.employeeWorkSchedule.findMany({
    where: { companyId, userId },
    orderBy: { dayOfWeek: "asc" },
  });

  if (rows.length === 0) {
    return defaultEmployeeWorkSchedule();
  }

  const byDay = new Map(rows.map((row) => [row.dayOfWeek, row]));
  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    const row = byDay.get(dayOfWeek);
    return {
      dayOfWeek,
      isWorking: row?.isWorking ?? false,
      startTime: row?.startTime ?? null,
      endTime: row?.endTime ?? null,
    };
  });
}

export async function saveEmployeeWorkSchedule(
  companyId: string,
  userId: string,
  days: WorkScheduleDayDTO[]
) {
  await prisma.$transaction(
    days.map((day) =>
      prisma.employeeWorkSchedule.upsert({
        where: { userId_dayOfWeek: { userId, dayOfWeek: day.dayOfWeek } },
        create: {
          companyId,
          userId,
          dayOfWeek: day.dayOfWeek,
          isWorking: day.isWorking,
          startTime: day.startTime,
          endTime: day.endTime,
        },
        update: {
          isWorking: day.isWorking,
          startTime: day.startTime,
          endTime: day.endTime,
        },
      })
    )
  );

  return getEmployeeWorkSchedule(companyId, userId);
}

export async function assertEmployeeAvailableForAssignment(
  companyId: string,
  userId: string,
  startAt: Date,
  endAt: Date,
  excludeVisitId?: string
): Promise<AssignmentAvailability> {
  if (endAt <= startAt) return { error: "End time must be after start time", warning: null };

  const [employee, company] = await Promise.all([
    prisma.user.findFirst({
      where: { id: userId, companyId, status: "ACTIVE" },
      select: { id: true, name: true },
    }),
    prisma.company.findUnique({
      where: { id: companyId },
      select: { timezone: true },
    }),
  ]);
  if (!employee) return { error: "Employee not found", warning: null };

  const approvedTimeOff = await prisma.timeOffRequest.findFirst({
    where: {
      companyId,
      userId,
      status: TimeOffStatus.APPROVED,
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
  });
  if (approvedTimeOff) {
    return {
      error: `${employee.name} has approved time off during this period`,
      warning: null,
    };
  }

  const workDays = await prisma.employeeWorkSchedule.findMany({
    where: { companyId, userId },
  });

  const schedule =
    workDays.length > 0
      ? workDays
      : defaultEmployeeWorkSchedule().map((day) => ({
          dayOfWeek: day.dayOfWeek,
          isWorking: day.isWorking,
          startTime: day.startTime,
          endTime: day.endTime,
        }));

  const timezone = company?.timezone;
  const startParts = localTimeParts(timezone, startAt);
  const endParts = localTimeParts(timezone, endAt);
  const daySchedule = schedule.find((row) => row.dayOfWeek === startParts.day);

  let warning: string | null = null;
  if (daySchedule && !daySchedule.isWorking) {
    warning = `${employee.name} is not scheduled to work this day`;
  } else if (daySchedule?.isWorking && daySchedule.startTime && daySchedule.endTime) {
    const windowStart = toMinutes(daySchedule.startTime);
    const windowEnd = toMinutes(daySchedule.endTime);
    const endsNextDay = endParts.day !== startParts.day;
    const endMinutes = endsNextDay ? endParts.minutes + 24 * 60 : endParts.minutes;
    if (startParts.minutes < windowStart || endMinutes > windowEnd) {
      warning = `${employee.name} is only scheduled ${daySchedule.startTime}–${daySchedule.endTime} this day`;
    }
  }

  const conflictWhere = {
    companyId,
    assignedUserId: userId,
    status: { not: "CANCELLED" as const },
    startAt: { lt: endAt },
    endAt: { gt: startAt },
    ...(excludeVisitId ? { id: { not: excludeVisitId } } : {}),
  };
  const conflict = await prisma.visit.findFirst({
    where: conflictWhere,
    select: { id: true, title: true },
  });
  if (conflict) {
    return {
      error: `${employee.name} is already assigned to "${conflict.title}" during this time`,
      warning,
    };
  }

  return { error: null, warning };
}

export async function validateAssignmentUpdate(
  companyId: string,
  assignedUserId: string | null | undefined,
  startAt: Date,
  endAt: Date,
  excludeVisitId?: string
): Promise<AssignmentAvailability> {
  if (!assignedUserId) return { error: null, warning: null };
  return assertEmployeeAvailableForAssignment(companyId, assignedUserId, startAt, endAt, excludeVisitId);
}
