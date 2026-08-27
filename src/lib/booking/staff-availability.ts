import { addMinutes, isBefore, isEqual } from "date-fns";
import { TimeOffStatus } from "@prisma/client";
import { DEFAULT_BUSINESS_HOURS, type BusinessHoursDay } from "@/lib/company/types";
import {
  addZonedDays,
  getZonedDayKey,
  getZonedParts,
  getZonedWeekdayIndex,
  resolveCompanyTimezone,
  startOfZonedDay,
  zonedWallTimeToUtc,
} from "@/lib/datetime/zoned";
import { prisma } from "@/lib/prisma";
import { BOOKING_LOOKAHEAD_DAYS, type BookingSlot } from "@/lib/booking/availability";
import { toMinutes } from "@/lib/schedule/open-time-slots";

type WorkWindow = {
  dayOfWeek: number;
  isWorking: boolean;
  startTime: string | null;
  endTime: string | null;
};

export const VIRTUAL_SLOT_MINUTES = 30;

export type BookableStaff = {
  id: string;
  name: string;
  email: string;
};

function mergeBusinessHours(businessHours: unknown): Record<string, BusinessHoursDay> {
  if (!businessHours || typeof businessHours !== "object") {
    return { ...DEFAULT_BUSINESS_HOURS };
  }
  return { ...DEFAULT_BUSINESS_HOURS, ...(businessHours as Record<string, BusinessHoursDay>) };
}

function parseHm(time: string): { hour: number; minute: number } {
  const [h, m] = time.split(":").map(Number);
  return { hour: h || 0, minute: m || 0 };
}

function slotsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export async function listBookableStaff(companyId: string): Promise<BookableStaff[]> {
  const users = await prisma.user.findMany({
    where: {
      companyId,
      status: "ACTIVE",
      onlineBookingEnabled: true,
      appleDemoAccount: false,
    },
    select: { id: true, name: true, email: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });
  return users;
}

export async function loadOnlineBookingCompany(companyId: string) {
  return prisma.company.findFirst({
    where: { id: companyId, onlineBookingEnabled: true },
    select: {
      id: true,
      name: true,
      phone: true,
      supportEmail: true,
      website: true,
      description: true,
      bookingLeadTimeHours: true,
      businessHours: true,
      timezone: true,
      onlineBookingVirtualOnly: true,
      googleCalendarRefreshToken: true,
    },
  });
}

type StaffBusy = {
  visits: Array<{ assignedUserId: string | null; startAt: Date; endAt: Date }>;
  timeOff: Array<{ userId: string; startAt: Date; endAt: Date }>;
  schedules: Map<string, WorkWindow[]>;
};

async function loadStaffBusy(companyId: string, userIds: string[], rangeStart: Date, rangeEnd: Date): Promise<StaffBusy> {
  const [visits, timeOff, scheduleRows] = await Promise.all([
    prisma.visit.findMany({
      where: {
        companyId,
        assignedUserId: { in: userIds },
        status: { notIn: ["CANCELLED"] },
        startAt: { lt: rangeEnd },
        endAt: { gt: rangeStart },
      },
      select: { assignedUserId: true, startAt: true, endAt: true },
    }),
    prisma.timeOffRequest.findMany({
      where: {
        companyId,
        userId: { in: userIds },
        status: TimeOffStatus.APPROVED,
        startAt: { lt: rangeEnd },
        endAt: { gt: rangeStart },
      },
      select: { userId: true, startAt: true, endAt: true },
    }),
    prisma.employeeWorkSchedule.findMany({
      where: { companyId, userId: { in: userIds } },
      select: { userId: true, dayOfWeek: true, isWorking: true, startTime: true, endTime: true },
    }),
  ]);

  const schedules = new Map<string, WorkWindow[]>();
  for (const row of scheduleRows) {
    const list = schedules.get(row.userId) ?? [];
    list.push(row);
    schedules.set(row.userId, list);
  }

  return { visits, timeOff, schedules };
}

function staffWindowForDay(params: {
  userId: string;
  dayOfWeek: number;
  companyDay: BusinessHoursDay | undefined;
  schedules: StaffBusy["schedules"];
}): { start: string; end: string } | null {
  const rows = params.schedules.get(params.userId);
  if (rows && rows.length) {
    const day = rows.find((row) => row.dayOfWeek === params.dayOfWeek);
    if (!day?.isWorking) return null;
    return {
      start: day.startTime ?? params.companyDay?.start ?? "08:00",
      end: day.endTime ?? params.companyDay?.end ?? "17:00",
    };
  }
  if (!params.companyDay?.open || !params.companyDay.start || !params.companyDay.end) return null;
  return { start: params.companyDay.start, end: params.companyDay.end };
}

function userIsFree(params: {
  userId: string;
  slotStart: Date;
  slotEnd: Date;
  window: { start: string; end: string };
  busy: StaffBusy;
  timeZone: string;
}): boolean {
  const parts = getZonedParts(params.slotStart, params.timeZone);
  const startHm = parseHm(params.window.start);
  const endHm = parseHm(params.window.end);
  const windowStart = zonedWallTimeToUtc(
    params.timeZone,
    parts.year,
    parts.month,
    parts.day,
    startHm.hour,
    startHm.minute
  );
  const windowEnd = zonedWallTimeToUtc(
    params.timeZone,
    parts.year,
    parts.month,
    parts.day,
    endHm.hour,
    endHm.minute
  );
  if (params.slotStart < windowStart || params.slotEnd > windowEnd) return false;

  const visitBusy = params.busy.visits.some(
    (visit) =>
      visit.assignedUserId === params.userId &&
      slotsOverlap(params.slotStart, params.slotEnd, visit.startAt, visit.endAt)
  );
  if (visitBusy) return false;

  const off = params.busy.timeOff.some(
    (row) =>
      row.userId === params.userId &&
      slotsOverlap(params.slotStart, params.slotEnd, row.startAt, row.endAt)
  );
  return !off;
}

export async function getStaffOnlineBookingSlots(params: {
  companyId: string;
  businessHours: unknown;
  bookingLeadTimeHours: number;
  timeZone?: string | null;
  slotMinutes: number;
  staff: BookableStaff[];
  from?: Date;
  days?: number;
}): Promise<Array<BookingSlot & { availableUserIds: string[] }>> {
  if (!params.staff.length) return [];

  const timeZone = resolveCompanyTimezone(params.timeZone);
  const hours = mergeBusinessHours(params.businessHours);
  const from = params.from ?? new Date();
  const days = params.days ?? BOOKING_LOOKAHEAD_DAYS;
  const slotMinutes = params.slotMinutes;
  const leadTimeCutoff = addMinutes(from, params.bookingLeadTimeHours * 60);
  const rangeStart = startOfZonedDay(from, timeZone);
  const rangeEnd = addZonedDays(rangeStart, days + 1, timeZone);
  const userIds = params.staff.map((s) => s.id);
  const busy = await loadStaffBusy(params.companyId, userIds, rangeStart, rangeEnd);

  const holds = await prisma.appointmentHold.findMany({
    where: {
      companyId: params.companyId,
      expiresAt: { gt: from },
      startAt: { lt: rangeEnd },
      endAt: { gt: rangeStart },
    },
    select: { startAt: true, endAt: true },
  });

  const slots: Array<BookingSlot & { availableUserIds: string[] }> = [];

  for (let offset = 0; offset < days; offset++) {
    const day = addZonedDays(rangeStart, offset, timeZone);
    const key = getZonedDayKey(day, timeZone);
    const dayHours = hours[key];
    const dayOfWeek = getZonedWeekdayIndex(day, timeZone);
    const parts = getZonedParts(day, timeZone);

    const windows = params.staff
      .map((person) => staffWindowForDay({
        userId: person.id,
        dayOfWeek,
        companyDay: dayHours,
        schedules: busy.schedules,
      }))
      .filter((w): w is { start: string; end: string } => Boolean(w));

    if (!windows.length) continue;

    let earliest = windows[0].start;
    let latest = windows[0].end;
    for (const window of windows) {
      if (toMinutes(window.start) < toMinutes(earliest)) earliest = window.start;
      if (toMinutes(window.end) > toMinutes(latest)) latest = window.end;
    }

    const startHm = parseHm(earliest);
    const endHm = parseHm(latest);
    let cursor = zonedWallTimeToUtc(timeZone, parts.year, parts.month, parts.day, startHm.hour, startHm.minute);
    const dayEnd = zonedWallTimeToUtc(timeZone, parts.year, parts.month, parts.day, endHm.hour, endHm.minute);

    while (addMinutes(cursor, slotMinutes) <= dayEnd) {
      const slotEnd = addMinutes(cursor, slotMinutes);
      if (isBefore(slotEnd, leadTimeCutoff) || isEqual(slotEnd, leadTimeCutoff)) {
        cursor = addMinutes(cursor, slotMinutes);
        continue;
      }

      const holdBlocksEveryone = holds.some((hold) =>
        slotsOverlap(cursor, slotEnd, hold.startAt, hold.endAt)
      );
      if (holdBlocksEveryone) {
        cursor = addMinutes(cursor, slotMinutes);
        continue;
      }

      const availableUserIds = params.staff
        .filter((person) => {
          const window = staffWindowForDay({
            userId: person.id,
            dayOfWeek,
            companyDay: dayHours,
            schedules: busy.schedules,
          });
          if (!window) return false;
          return userIsFree({
            userId: person.id,
            slotStart: cursor,
            slotEnd,
            window,
            busy,
            timeZone,
          });
        })
        .map((person) => person.id);

      if (availableUserIds.length) {
        slots.push({
          startAt: cursor.toISOString(),
          endAt: slotEnd.toISOString(),
          availableUserIds,
        });
      }

      cursor = addMinutes(cursor, slotMinutes);
    }
  }

  return slots;
}

export async function pickAssigneeForSlot(params: {
  companyId: string;
  availableUserIds: string[];
  slotStart: Date;
  timeZone?: string | null;
}): Promise<string | null> {
  if (!params.availableUserIds.length) return null;
  const timeZone = resolveCompanyTimezone(params.timeZone);
  const dayStart = startOfZonedDay(params.slotStart, timeZone);
  const dayEnd = addZonedDays(dayStart, 1, timeZone);

  const counts = await prisma.visit.groupBy({
    by: ["assignedUserId"],
    where: {
      companyId: params.companyId,
      assignedUserId: { in: params.availableUserIds },
      status: { notIn: ["CANCELLED"] },
      startAt: { gte: dayStart, lt: dayEnd },
    },
    _count: { _all: true },
  });
  const byId = new Map(counts.map((row) => [row.assignedUserId, row._count._all]));
  return (
    [...params.availableUserIds].sort((a, b) => (byId.get(a) ?? 0) - (byId.get(b) ?? 0))[0] ?? null
  );
}
