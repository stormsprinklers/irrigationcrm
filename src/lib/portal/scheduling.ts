import { VisitStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAvailableSlots } from "@/lib/booking/availability";
import { DEFAULT_BUSINESS_HOURS } from "@/lib/company/types";
import { PORTAL_RESCHEDULABLE_STATUSES } from "./constants";
import type { PortalCompany } from "./company";

export function assertVisitWithinLeadHours(
  startAt: Date,
  leadHours: number,
  action: "reschedule" | "cancel"
) {
  const msUntil = startAt.getTime() - Date.now();
  const leadMs = leadHours * 60 * 60 * 1000;
  if (msUntil < leadMs) {
    throw new Error(
      `Cannot ${action} within ${leadHours} hours of the appointment start time`
    );
  }
}

export function assertVisitReschedulable(status: VisitStatus) {
  if (!PORTAL_RESCHEDULABLE_STATUSES.includes(status as (typeof PORTAL_RESCHEDULABLE_STATUSES)[number])) {
    throw new Error("This visit cannot be rescheduled or cancelled");
  }
}

export async function getPortalAvailableSlots(company: PortalCompany) {
  return getAvailableSlots({
    companyId: company.id,
    businessHours: (company.businessHours as Record<string, unknown>) ?? DEFAULT_BUSINESS_HOURS,
    bookingLeadTimeHours: company.bookingLeadTimeHours,
  });
}

export async function assertSlotAvailable(
  company: PortalCompany,
  startAt: Date,
  endAt: Date
) {
  const slots = await getPortalAvailableSlots(company);
  const valid = slots.some(
    (s) => s.startAt === startAt.toISOString() && s.endAt === endAt.toISOString()
  );
  if (!valid) {
    throw new Error("Selected time slot is no longer available");
  }
}

export async function getCustomerVisit(
  companyId: string,
  customerId: string,
  visitId: string
) {
  return prisma.visit.findFirst({
    where: { id: visitId, companyId, customerId },
    include: {
      assignedUser: { select: { id: true, name: true, photoUrl: true, title: true } },
      property: { select: { id: true, name: true, address: true, city: true, state: true, zip: true } },
    },
  });
}
