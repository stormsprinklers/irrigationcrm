import { addMinutes, isBefore, isEqual } from "date-fns";
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

export const BOOKING_SLOT_MINUTES = 120;
export const BOOKING_LOOKAHEAD_DAYS = 14;

export type BookingSlot = {
  startAt: string;
  endAt: string;
};

export type AvailabilityParams = {
  companyId: string;
  businessHours: unknown;
  bookingLeadTimeHours: number;
  /** IANA timezone for business-hours wall clock. Defaults to America/Denver. */
  timeZone?: string | null;
  from?: Date;
  days?: number;
  slotMinutes?: number;
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

export async function getAvailableSlots(params: AvailabilityParams): Promise<BookingSlot[]> {
  const timeZone = resolveCompanyTimezone(params.timeZone);
  const hours = mergeBusinessHours(params.businessHours);
  const from = params.from ?? new Date();
  const days = params.days ?? BOOKING_LOOKAHEAD_DAYS;
  const slotMinutes = params.slotMinutes ?? BOOKING_SLOT_MINUTES;
  const leadTimeCutoff = addMinutes(from, params.bookingLeadTimeHours * 60);

  const rangeStart = startOfZonedDay(from, timeZone);
  const rangeEnd = addZonedDays(rangeStart, days + 1, timeZone);

  const existingVisits = await prisma.visit.findMany({
    where: {
      companyId: params.companyId,
      status: { notIn: ["CANCELLED"] },
      startAt: { lt: rangeEnd },
      endAt: { gt: rangeStart },
    },
    select: { startAt: true, endAt: true },
  });

  const activeHolds = await prisma.appointmentHold.findMany({
    where: {
      companyId: params.companyId,
      expiresAt: { gt: from },
      startAt: { lt: rangeEnd },
      endAt: { gt: rangeStart },
    },
    select: { startAt: true, endAt: true },
  });

  const busyBlocks = [...existingVisits, ...activeHolds];

  const slots: BookingSlot[] = [];

  for (let offset = 0; offset < days; offset++) {
    const day = addZonedDays(rangeStart, offset, timeZone);
    const key = getZonedDayKey(day, timeZone);
    const dayHours = hours[key];
    if (!dayHours?.open || !dayHours.start || !dayHours.end) continue;

    const parts = getZonedParts(day, timeZone);
    const startHm = parseHm(dayHours.start);
    const endHm = parseHm(dayHours.end);

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

      if (isBefore(slotEnd, leadTimeCutoff) || isEqual(slotEnd, leadTimeCutoff)) {
        cursor = addMinutes(cursor, slotMinutes);
        continue;
      }

      const hasConflict = busyBlocks.some((block) =>
        slotsOverlap(cursor, slotEnd, block.startAt, block.endAt)
      );

      if (!hasConflict) {
        slots.push({
          startAt: cursor.toISOString(),
          endAt: slotEnd.toISOString(),
        });
      }

      cursor = addMinutes(cursor, slotMinutes);
    }
  }

  return slots;
}

export function formatSlotLabel(startAt: string, endAt: string, timeZone?: string | null): string {
  const tz = resolveCompanyTimezone(timeZone);
  const start = new Date(startAt);
  const end = new Date(endAt);
  const day = start.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: tz,
  });
  const startTime = start.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  });
  const endTime = end.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  });
  return `${day} · ${startTime} – ${endTime}`;
}
