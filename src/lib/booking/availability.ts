import { addDays, addMinutes, format, isBefore, isEqual, startOfDay } from "date-fns";
import { DEFAULT_BUSINESS_HOURS, type BusinessHoursDay } from "@/lib/company/types";
import { prisma } from "@/lib/prisma";

export const BOOKING_SLOT_MINUTES = 120;
export const BOOKING_LOOKAHEAD_DAYS = 14;

const DAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type BookingSlot = {
  startAt: string;
  endAt: string;
};

export type AvailabilityParams = {
  companyId: string;
  businessHours: unknown;
  bookingLeadTimeHours: number;
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

function parseTimeOnDate(baseDate: Date, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(baseDate);
  d.setHours(h, m, 0, 0);
  return d;
}

function dayKey(date: Date): string {
  return DAY_KEYS[date.getDay()];
}

function slotsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export async function getAvailableSlots(params: AvailabilityParams): Promise<BookingSlot[]> {
  const hours = mergeBusinessHours(params.businessHours);
  const from = params.from ?? new Date();
  const days = params.days ?? BOOKING_LOOKAHEAD_DAYS;
  const slotMinutes = params.slotMinutes ?? BOOKING_SLOT_MINUTES;
  const leadTimeCutoff = addMinutes(from, params.bookingLeadTimeHours * 60);

  const rangeStart = startOfDay(from);
  const rangeEnd = addDays(rangeStart, days + 1);

  const existingVisits = await prisma.visit.findMany({
    where: {
      companyId: params.companyId,
      status: { notIn: ["CANCELLED"] },
      startAt: { lt: rangeEnd },
      endAt: { gt: rangeStart },
    },
    select: { startAt: true, endAt: true },
  });

  const slots: BookingSlot[] = [];

  for (let offset = 0; offset < days; offset++) {
    const day = addDays(rangeStart, offset);
    const key = dayKey(day);
    const dayHours = hours[key];
    if (!dayHours?.open || !dayHours.start || !dayHours.end) continue;

    let cursor = parseTimeOnDate(day, dayHours.start);
    const dayEnd = parseTimeOnDate(day, dayHours.end);

    while (addMinutes(cursor, slotMinutes) <= dayEnd) {
      const slotEnd = addMinutes(cursor, slotMinutes);

      if (isBefore(slotEnd, leadTimeCutoff) || isEqual(slotEnd, leadTimeCutoff)) {
        cursor = addMinutes(cursor, slotMinutes);
        continue;
      }

      const hasConflict = existingVisits.some((visit) =>
        slotsOverlap(cursor, slotEnd, visit.startAt, visit.endAt)
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

export function formatSlotLabel(startAt: string, endAt: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  return `${format(start, "EEE, MMM d")} · ${format(start, "h:mm a")} – ${format(end, "h:mm a")}`;
}
