import { addDays, addMinutes, isBefore, startOfDay } from "date-fns";
import { DEFAULT_BUSINESS_HOURS, type BusinessHoursDay } from "@/lib/company/types";
import { prisma } from "@/lib/prisma";

export const HIRING_SCREEN_MINUTES = 10;
export const HIRING_LOOKAHEAD_DAYS = 14;

const DAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

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

function parseTimeOnDate(baseDate: Date, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(baseDate);
  d.setHours(h, m, 0, 0);
  return d;
}

function dayKey(date: Date): string {
  return DAY_KEYS[date.getDay()];
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

export async function getHiringManagerSlots(params: {
  companyId: string;
  managerUserId: string;
  from?: Date;
  days?: number;
  slotMinutes?: number;
}): Promise<HiringSlot[]> {
  const availability = await prisma.hiringManagerAvailability.findUnique({
    where: { userId: params.managerUserId },
  });

  const hours = mergeWeeklyHours(availability?.weeklyHours);
  const blocked = parseBlockedSlots(availability?.blockedSlots);
  const leadTimeHours = availability?.leadTimeHours ?? 2;
  const from = params.from ?? new Date();
  const days = params.days ?? HIRING_LOOKAHEAD_DAYS;
  const slotMinutes = params.slotMinutes ?? HIRING_SCREEN_MINUTES;
  const leadTimeCutoff = addMinutes(from, leadTimeHours * 60);

  const rangeStart = startOfDay(from);
  const rangeEnd = addDays(rangeStart, days + 1);

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
    const day = addDays(rangeStart, dayOffset);
    const key = dayKey(day);
    const window = hours[key];
    if (!window?.open) continue;

    let cursor = parseTimeOnDate(day, window.start);
    const dayEnd = parseTimeOnDate(day, window.end);

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
