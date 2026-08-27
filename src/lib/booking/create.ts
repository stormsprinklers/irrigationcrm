import { Division, VisitStatus } from "@prisma/client";
import { getAvailableSlots, BOOKING_SLOT_MINUTES } from "@/lib/booking/availability";
import {
  getStaffOnlineBookingSlots,
  listBookableStaff,
  loadOnlineBookingCompany,
  pickAssigneeForSlot,
  VIRTUAL_SLOT_MINUTES,
  type BookableStaff,
} from "@/lib/booking/staff-availability";
import { createGoogleMeetEvent } from "@/lib/google-calendar/client";
import { normalizePhone } from "@/lib/inbox/contacts";
import { onVisitTimeChanged } from "@/lib/notifications/visit-events";
import { prisma } from "@/lib/prisma";
import { resolveServiceAreaByZip } from "@/lib/service-areas";
import { resolveCompanyTimezone } from "@/lib/datetime/zoned";
import { DEFAULT_BUSINESS_HOURS } from "@/lib/company/types";

export class OnlineBookingError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type OnlineBookingInput = {
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  startAt: string;
  endAt: string;
  notes?: string | null;
};

type InternalSlot = { startAt: string; endAt: string; availableUserIds?: string[] };

type BookingOffer = {
  company: {
    id: string;
    name: string;
    phone: string | null;
    supportEmail: string | null;
    website: string | null;
    description: string | null;
    timezone: string | null;
    bookingLeadTimeHours: number;
  };
  virtual: boolean;
  slotMinutes: number;
  requireEmail: boolean;
  googleMeetReady: boolean;
  setupRequired: boolean;
  slots: Array<{ startAt: string; endAt: string }>;
  internalSlots: InternalSlot[];
  staff: BookableStaff[];
};

function sameInstant(a: string | Date, b: string | Date) {
  return new Date(a).getTime() === new Date(b).getTime();
}

async function loadBookingOffer(companyId: string): Promise<BookingOffer | null> {
  const company = await loadOnlineBookingCompany(companyId);
  if (!company) return null;

  const staff = await listBookableStaff(companyId);
  const virtual = Boolean(company.onlineBookingVirtualOnly);
  const slotMinutes = virtual ? VIRTUAL_SLOT_MINUTES : BOOKING_SLOT_MINUTES;

  let internalSlots: InternalSlot[];
  if (staff.length) {
    internalSlots = await getStaffOnlineBookingSlots({
      companyId,
      businessHours: company.businessHours ?? DEFAULT_BUSINESS_HOURS,
      bookingLeadTimeHours: company.bookingLeadTimeHours,
      timeZone: company.timezone,
      slotMinutes,
      staff,
    });
  } else if (virtual) {
    internalSlots = [];
  } else {
    internalSlots = await getAvailableSlots({
      companyId,
      businessHours: company.businessHours ?? DEFAULT_BUSINESS_HOURS,
      bookingLeadTimeHours: company.bookingLeadTimeHours,
      timeZone: company.timezone,
      slotMinutes,
    });
  }

  return {
    company: {
      id: company.id,
      name: company.name,
      phone: company.phone,
      supportEmail: company.supportEmail,
      website: company.website,
      description: company.description,
      timezone: company.timezone,
      bookingLeadTimeHours: company.bookingLeadTimeHours,
    },
    virtual,
    slotMinutes,
    requireEmail: virtual,
    googleMeetReady: Boolean(company.googleCalendarRefreshToken),
    setupRequired: virtual && staff.length === 0,
    slots: internalSlots.map(({ startAt, endAt }) => ({ startAt, endAt })),
    internalSlots,
    staff,
  };
}

export async function getPublicOnlineBookingOffer(companyId: string) {
  const offer = await loadBookingOffer(companyId);
  if (!offer) return null;
  return {
    company: {
      name: offer.company.name,
      phone: offer.company.phone,
      supportEmail: offer.company.supportEmail,
      website: offer.company.website,
      description: offer.company.description,
      timezone: offer.company.timezone,
      bookingLeadTimeHours: offer.company.bookingLeadTimeHours,
    },
    virtual: offer.virtual,
    slotMinutes: offer.slotMinutes,
    requireEmail: offer.requireEmail,
    googleMeetReady: offer.googleMeetReady,
    setupRequired: offer.setupRequired,
    slots: offer.slots,
  };
}

export async function createOnlineBooking(companyId: string, input: OnlineBookingInput) {
  const offer = await loadBookingOffer(companyId);
  if (!offer) {
    throw new OnlineBookingError("Booking not available", 404);
  }

  const name = input.name.trim();
  const phone = input.phone.trim();
  const email = input.email?.trim().toLowerCase() || "";
  const zip = input.zip?.replace(/\D/g, "") ?? "";
  const { virtual, staff } = offer;

  if (!name || !phone || !input.startAt || !input.endAt) {
    throw new OnlineBookingError("name, phone, startAt, and endAt are required");
  }
  if (virtual && !email) {
    throw new OnlineBookingError("Email is required so we can send your Google Meet invite");
  }
  if (!virtual && zip.length < 5) {
    throw new OnlineBookingError("zip is required");
  }
  if (virtual && staff.length === 0) {
    throw new OnlineBookingError(
      "Online booking is not configured yet. Please call us to schedule.",
      503
    );
  }

  const slotStart = new Date(input.startAt);
  const slotEnd = new Date(input.endAt);
  const matched = offer.internalSlots.find(
    (slot) => sameInstant(slot.startAt, slotStart) && sameInstant(slot.endAt, slotEnd)
  );
  if (!matched) {
    throw new OnlineBookingError("Selected time slot is no longer available", 409);
  }

  let serviceArea: { id: string; name: string } | null = null;
  if (zip.length >= 5) {
    const area = await resolveServiceAreaByZip(companyId, zip);
    if (area) serviceArea = { id: area.id, name: area.name };
  }
  if (!virtual && !serviceArea) {
    throw new OnlineBookingError("We do not currently service this zip code");
  }
  if (!serviceArea) {
    const fallback = await prisma.serviceArea.findFirst({
      where: { companyId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    });
    serviceArea = fallback;
  }

  let assignedUserId: string | null = null;
  if (staff.length) {
    const available = matched.availableUserIds?.length
      ? matched.availableUserIds
      : staff.map((person) => person.id);
    assignedUserId = await pickAssigneeForSlot({
      companyId,
      availableUserIds: available,
      slotStart,
      timeZone: offer.company.timezone,
    });
    if (!assignedUserId) {
      throw new OnlineBookingError("Selected time slot is no longer available", 409);
    }
  }

  const normalizedPhone = normalizePhone(phone);
  let customer = await prisma.customer.findFirst({
    where: {
      companyId,
      OR: [{ phone: normalizedPhone }, ...(email ? [{ email }] : [])],
    },
  });

  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        companyId,
        name,
        phone: normalizedPhone,
        email: email || null,
        address: input.address ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        zip: zip || null,
        leadSource: "Online booking",
      },
    });
  } else {
    if (customer.doNotService) {
      throw new OnlineBookingError(
        "Online booking is not available for this account. Please call us.",
        403
      );
    }
    customer = await prisma.customer.update({
      where: { id: customer.id },
      data: {
        name,
        ...(email ? { email } : {}),
        ...(input.address ? { address: String(input.address) } : {}),
        ...(input.city ? { city: String(input.city) } : {}),
        ...(input.state ? { state: String(input.state) } : {}),
        ...(zip ? { zip } : {}),
      },
    });
  }

  let propertyId: string | null = null;
  if (!virtual || input.address || zip) {
    const property = await prisma.customerProperty.create({
      data: {
        companyId,
        customerId: customer.id,
        name: virtual ? "Consultation" : "Service address",
        address: input.address ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        zip: zip || null,
        isPrimary: false,
      },
    });
    propertyId = property.id;
  }

  const visitTitle = virtual ? "Virtual consultation" : "Service appointment";
  const assignee = assignedUserId
    ? staff.find((person) => person.id === assignedUserId) ??
      (await prisma.user.findUnique({
        where: { id: assignedUserId },
        select: { name: true, email: true },
      }))
    : null;

  const visit = await prisma.visit.create({
    data: {
      companyId,
      customerId: customer.id,
      propertyId,
      title: visitTitle,
      startAt: slotStart,
      endAt: slotEnd,
      division: Division.SERVICE,
      serviceAreaId: serviceArea?.id ?? null,
      assignedUserId,
      status: VisitStatus.SCHEDULED,
      address: input.address ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      zip: zip || null,
      tags: virtual ? ["online-booking", "virtual"] : ["online-booking"],
    },
  });

  let meetingUrl: string | null = null;
  let calendarWarning: string | null = null;
  if (virtual) {
    try {
      const meet = await createGoogleMeetEvent({
        companyId,
        title: `${visitTitle} — ${name}`,
        description: [
          `Virtual consultation with ${offer.company.name}.`,
          input.notes ? `Notes: ${input.notes}` : "",
          `Phone: ${phone}`,
        ]
          .filter(Boolean)
          .join("\n"),
        startAt: slotStart,
        endAt: slotEnd,
        timeZone: resolveCompanyTimezone(offer.company.timezone),
        attendeeEmails: [email, assignee?.email ?? ""].filter(Boolean),
      });
      if (!meet) {
        calendarWarning =
          "Appointment saved, but Google Calendar is not connected yet so no Meet invite was sent.";
      } else {
        meetingUrl = meet.hangoutLink ?? meet.htmlLink ?? null;
        if (meetingUrl) {
          await prisma.visit.update({
            where: { id: visit.id },
            data: { meetingUrl },
          });
        }
      }
    } catch (err) {
      console.error("[online-booking] Google Meet create failed", err);
      calendarWarning =
        "Appointment saved, but we could not create the Google Meet invite. We'll follow up with a link.";
    }
  }

  if (input.notes) {
    const admin = await prisma.user.findFirst({
      where: { companyId, role: "ADMIN" },
      select: { id: true },
    });
    if (admin) {
      await prisma.visitNote.create({
        data: { visitId: visit.id, authorId: admin.id, body: String(input.notes) },
      });
    }
  }

  void onVisitTimeChanged({
    visitId: visit.id,
    companyId,
    isInitialSchedule: true,
  }).catch(() => {});

  const { onReferralVisitBooked } = await import("@/lib/referrals/conversion");
  void onReferralVisitBooked({
    companyId,
    customerId: customer.id,
    visitId: visit.id,
  }).catch(() => {});

  return {
    visitId: visit.id,
    startAt: visit.startAt.toISOString(),
    endAt: visit.endAt.toISOString(),
    virtual,
    meetingUrl,
    calendarWarning,
    assignedName: assignee?.name ?? null,
    serviceArea: serviceArea?.name ?? null,
  };
}
