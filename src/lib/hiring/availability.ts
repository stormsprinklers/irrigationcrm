import { addMinutes, isBefore } from "date-fns";
import { DEFAULT_BUSINESS_HOURS, type BusinessHoursDay } from "@/lib/company/types";
import {
  addZonedDays,
  getZonedDayKey,
  getZonedParts,
  resolveCompanyTimezone,
  startOfZonedDay,
  zonedWallTimeToUtc,
} from "@/lib/datetime/zoned";
import { prisma } from "@/lib/prisma";

export const HIRING_SCREEN_MINUTES = 10;
export const HIRING_LOOKAHEAD_DAYS = 14;

export type HiringSlot = {
  startAt: string;
  endAt: string;
};

function mergeWeeklyHours(weeklyHours: unknown): Record<string, BusinessHoursDay> {
  if (!weeklyHours || typeof weeklyHours !== "object") {
    return { ...DEFAULT_BUSINESS_HOURS };
  }
  return { ...DEFAULT_BUSINESS_HOURS, ...(weeklyHours as Record<string, BusinessHoursDay>) };
}

type BlockedSlot = { startAt: string; endAt: string };

function parseBlockedSlots(raw: unknown): BlockedSlot[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (row): row is BlockedSlot =>
      Boolean(row) &&
      typeof row === "object" &&
      typeof (row as BlockedSlot).startAt === "string" &&
      typeof (row as BlockedSlot).endAt === "string"
  );
}

function parseHm(time: string): { hour: number; minute: number } {
  const [h, m] = time.split(":").map(Number);
  return { hour: h || 0, minute: m || 0 };
}

export async function getHiringManagerSlots(params: {
  companyId: string;
  managerUserId: string;
  /** IANA timezone for wall-clock hours (defaults to company.timezone / Denver). */
  timeZone?: string | null;
  from?: Date;
  days?: number;
  slotMinutes?: number;
}): Promise<HiringSlot[]> {
  const [availability, company] = await Promise.all([
    prisma.hiringManagerAvailability.findUnique({
      where: { userId: params.managerUserId },
    }),
    params.timeZone
      ? Promise.resolve(null)
      : prisma.company.findUnique({
          where: { id: params.companyId },
          select: { timezone: true },
        }),
  ]);

  const timeZone = resolveCompanyTimezone(params.timeZone ?? company?.timezone);
  const hours = mergeWeeklyHours(availability?.weeklyHours);
  const blocked = parseBlockedSlots(availability?.blockedSlots);
  const leadTimeHours = availability?.leadTimeHours ?? 2;
  const from = params.from ?? new Date();
  const days = params.days ?? HIRING_LOOKAHEAD_DAYS;
  const slotMinutes = params.slotMinutes ?? HIRING_SCREEN_MINUTES;
  const leadTimeCutoff = addMinutes(from, leadTimeHours * 60);

  const rangeStart = startOfZonedDay(from, timeZone);
  const rangeEnd = addZonedDays(rangeStart, days + 1, timeZone);

  const existing = await prisma.hiringScreenBooking.findMany({
    where: {
      companyId: params.companyId,
      managerUserId: params.managerUserId,
      status: { not: "CANCELLED" },
      startAt: { lt: rangeEnd },
      endAt: { gt: rangeStart },
    },
    select: { startAt: true, endAt: true },
  });

  const busy = [
    ...existing.map((row) => ({ start: row.startAt, end: row.endAt })),
    ...blocked.map((row) => ({ start: new Date(row.startAt), end: new Date(row.endAt) })),
  ];

  const slots: HiringSlot[] = [];

  for (let dayOffset = 0; dayOffset < days; dayOffset++) {
    const day = addZonedDays(rangeStart, dayOffset, timeZone);
    const key = getZonedDayKey(day, timeZone);
    const window = hours[key];
    if (!window?.open) continue;

    const parts = getZonedParts(day, timeZone);
    const startHm = parseHm(window.start);
    const endHm = parseHm(window.end);

    let cursor = zonedWallTimeToUtc(
      timeZone,
      parts.year,
      parts.month,
      parts.day,
      startHm.hour,
      startHm.minute
    );
    const dayEnd = zonedWallTimeToUtc(
      timeZone,
      parts.year,
      parts.month,
      parts.day,
      endHm.hour,
      endHm.minute
    );

    while (addMinutes(cursor, slotMinutes) <= dayEnd) {
      const slotEnd = addMinutes(cursor, slotMinutes);
      const tooSoon = isBefore(cursor, leadTimeCutoff);
      const conflict = busy.some((b) => cursor < b.end && b.start < slotEnd);
      if (!tooSoon && !conflict) {
        slots.push({ startAt: cursor.toISOString(), endAt: slotEnd.toISOString() });
      }
      cursor = slotEnd;
    }
  }

  return slots;
}

export async function resolveHiringManagerForJob(companyId: string, jobSlug: string) {
  const assignment = await prisma.hiringRoleAssignment.findUnique({
    where: { companyId_jobSlug: { companyId, jobSlug } },
    select: {
      hiringManagerUserId: true,
      hiringManager: { select: { id: true, name: true, email: true } },
    },
  });
  if (assignment) return assignment.hiringManager;

  const fallback = await prisma.user.findFirst({
    where: {
      companyId,
      status: "ACTIVE",
      role: { in: ["ADMIN", "MANAGER"] },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true },
  });
  return fallback;
}
