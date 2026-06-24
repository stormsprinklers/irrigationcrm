import { NextRequest, NextResponse } from "next/server";
import { Division, VisitStatus } from "@prisma/client";
import { getAvailableSlots } from "@/lib/booking/availability";
import { DEFAULT_BUSINESS_HOURS } from "@/lib/company/types";
import { normalizePhone } from "@/lib/inbox/contacts";
import { prisma } from "@/lib/prisma";
import { resolveServiceAreaByZip } from "@/lib/service-areas";
import { onVisitTimeChanged } from "@/lib/notifications/visit-events";

type Params = { params: Promise<{ slug: string }> };

async function getCompanyBySlug(slug: string) {
  return prisma.company.findFirst({
    where: { bookingSlug: slug, onlineBookingEnabled: true },
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
    },
  });
}

export async function GET(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const company = await getCompanyBySlug(slug);
  if (!company) {
    return NextResponse.json({ error: "Booking not available" }, { status: 404 });
  }

  const { searchParams } = request.nextUrl;
  const zip = searchParams.get("zip") ?? undefined;
  let serviceArea: { id: string; name: string } | null = null;
  if (zip) {
    const area = await resolveServiceAreaByZip(company.id, zip);
    if (area) serviceArea = { id: area.id, name: area.name };
  }

  const slots = await getAvailableSlots({
    companyId: company.id,
    businessHours: company.businessHours ?? DEFAULT_BUSINESS_HOURS,
    bookingLeadTimeHours: company.bookingLeadTimeHours,
  });

  return NextResponse.json({
    company: {
      name: company.name,
      phone: company.phone,
      supportEmail: company.supportEmail,
      website: company.website,
      description: company.description,
      timezone: company.timezone,
      bookingLeadTimeHours: company.bookingLeadTimeHours,
    },
    serviceArea,
    slots,
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const company = await getCompanyBySlug(slug);
  if (!company) {
    return NextResponse.json({ error: "Booking not available" }, { status: 404 });
  }

  const body = await request.json();
  const {
    name,
    phone,
    email,
    address,
    city,
    state,
    zip,
    startAt,
    endAt,
    title,
    notes,
  } = body;

  if (!name || !phone || !zip || !startAt || !endAt) {
    return NextResponse.json(
      { error: "name, phone, zip, startAt, and endAt are required" },
      { status: 400 }
    );
  }

  const serviceArea = await resolveServiceAreaByZip(company.id, String(zip));
  if (!serviceArea) {
    return NextResponse.json(
      { error: "We do not currently service this zip code" },
      { status: 400 }
    );
  }

  const slotStart = new Date(startAt);
  const slotEnd = new Date(endAt);
  const slots = await getAvailableSlots({
    companyId: company.id,
    businessHours: company.businessHours ?? DEFAULT_BUSINESS_HOURS,
    bookingLeadTimeHours: company.bookingLeadTimeHours,
  });

  const slotValid = slots.some(
    (s) => s.startAt === slotStart.toISOString() && s.endAt === slotEnd.toISOString()
  );
  if (!slotValid) {
    return NextResponse.json({ error: "Selected time slot is no longer available" }, { status: 409 });
  }

  const normalizedPhone = normalizePhone(String(phone));

  let customer = await prisma.customer.findFirst({
    where: {
      companyId: company.id,
      OR: [
        { phone: normalizedPhone },
        ...(email ? [{ email: String(email).toLowerCase() }] : []),
      ],
    },
  });

  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        companyId: company.id,
        name: String(name),
        phone: normalizedPhone,
        email: email ? String(email).toLowerCase() : null,
        address: address ?? null,
        city: city ?? null,
        state: state ?? null,
        zip: zip ?? null,
        leadSource: "Online booking",
      },
    });
  } else {
    if (customer.doNotService) {
      return NextResponse.json(
        { error: "Online booking is not available for this account. Please call us." },
        { status: 403 }
      );
    }
    customer = await prisma.customer.update({
      where: { id: customer.id },
      data: {
        name: String(name),
        ...(email ? { email: String(email).toLowerCase() } : {}),
        ...(address ? { address: String(address) } : {}),
        ...(city ? { city: String(city) } : {}),
        ...(state ? { state: String(state) } : {}),
        zip: String(zip),
      },
    });
  }

  const property = await prisma.customerProperty.create({
    data: {
      companyId: company.id,
      customerId: customer.id,
      name: "Service address",
      address: address ?? null,
      city: city ?? null,
      state: state ?? null,
      zip: String(zip),
      isPrimary: true,
    },
  });

  const visitTitle = title ? String(title) : "Service appointment";
  const visit = await prisma.visit.create({
    data: {
      companyId: company.id,
      customerId: customer.id,
      propertyId: property.id,
      title: visitTitle,
      startAt: slotStart,
      endAt: slotEnd,
      division: Division.SERVICE,
      serviceAreaId: serviceArea.id,
      status: VisitStatus.SCHEDULED,
      address: address ?? null,
      city: city ?? null,
      state: state ?? null,
      zip: String(zip),
      tags: notes ? ["online-booking"] : ["online-booking"],
    },
  });

  if (notes) {
    const admin = await prisma.user.findFirst({
      where: { companyId: company.id, role: "ADMIN" },
      select: { id: true },
    });
    if (admin) {
      await prisma.visitNote.create({
        data: { visitId: visit.id, authorId: admin.id, body: String(notes) },
      });
    }
  }

  void onVisitTimeChanged({
    visitId: visit.id,
    companyId: company.id,
    isInitialSchedule: true,
  }).catch(() => {});

  return NextResponse.json(
    {
      visitId: visit.id,
      startAt: visit.startAt.toISOString(),
      endAt: visit.endAt.toISOString(),
      serviceArea: serviceArea.name,
    },
    { status: 201 }
  );
}
