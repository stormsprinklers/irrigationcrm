import { NextRequest, NextResponse } from "next/server";
import { Division, VisitStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveServiceAreaByZip } from "@/lib/service-areas";
import {
  buildVisitContext,
  type NotificationEvent,
} from "@/lib/notifications/templates";
import { sendOperationalNotification } from "@/lib/notifications/send";
import {
  requirePortalCustomer,
  portalForbiddenResponse,
  portalUnauthorizedResponse,
} from "@/lib/portal/auth";
import { assertSlotAvailable } from "@/lib/portal/scheduling";

export async function POST(request: NextRequest) {
  const ctx = await requirePortalCustomer();
  if (!ctx) return portalUnauthorizedResponse();
  if (!ctx.company.portalAllowSchedule) {
    return portalForbiddenResponse("Scheduling is not available in the portal");
  }
  if (ctx.customer.doNotService) {
    return portalForbiddenResponse("Scheduling is not available for this account");
  }

  const body = await request.json();
  const { propertyId, startAt, endAt, title, notes, zip } = body as {
    propertyId?: string;
    startAt?: string;
    endAt?: string;
    title?: string;
    notes?: string;
    zip?: string;
  };

  if (!startAt || !endAt) {
    return NextResponse.json({ error: "startAt and endAt are required" }, { status: 400 });
  }

  const slotStart = new Date(startAt);
  const slotEnd = new Date(endAt);

  let property = propertyId
    ? await prisma.customerProperty.findFirst({
        where: { id: propertyId, customerId: ctx.customerId, companyId: ctx.companyId },
      })
    : await prisma.customerProperty.findFirst({
        where: { customerId: ctx.customerId, companyId: ctx.companyId },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      });

  if (!property) {
    return NextResponse.json({ error: "No service property found" }, { status: 400 });
  }

  const serviceZip = zip ?? property.zip;
  if (!serviceZip) {
    return NextResponse.json({ error: "Zip code is required" }, { status: 400 });
  }

  const serviceArea = await resolveServiceAreaByZip(ctx.companyId, serviceZip);
  if (!serviceArea) {
    return NextResponse.json({ error: "We do not currently service this zip code" }, { status: 400 });
  }

  try {
    await assertSlotAvailable(ctx.company, slotStart, slotEnd);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Slot unavailable" },
      { status: 409 }
    );
  }

  const visitTitle = title?.trim() || "Service appointment";
  const visit = await prisma.visit.create({
    data: {
      companyId: ctx.companyId,
      customerId: ctx.customerId,
      propertyId: property.id,
      title: visitTitle,
      startAt: slotStart,
      endAt: slotEnd,
      division: Division.SERVICE,
      serviceAreaId: serviceArea.id,
      status: VisitStatus.SCHEDULED,
      address: property.address,
      city: property.city,
      state: property.state,
      zip: property.zip ?? serviceZip,
      tags: ["portal-booking"],
    },
  });

  if (notes?.trim()) {
    const admin = await prisma.user.findFirst({
      where: { companyId: ctx.companyId, role: "ADMIN" },
      select: { id: true },
    });
    if (admin) {
      await prisma.visitNote.create({
        data: { visitId: visit.id, authorId: admin.id, body: notes.trim() },
      });
    }
  }

  sendOperationalNotification({
    companyId: ctx.companyId,
    event: "VISIT_SCHEDULED" as NotificationEvent,
    recipient: {
      customerId: ctx.customerId,
      name: ctx.customer.name,
      email: ctx.customer.email,
      phone: ctx.customer.phone,
    },
    context: buildVisitContext({
      customerName: ctx.customer.name,
      companyName: ctx.company.name,
      visitTitle,
      startAt: slotStart,
      address: [property.address, property.city, property.state, property.zip].filter(Boolean).join(", "),
    }),
  }).catch(() => {});

  return NextResponse.json(
    {
      visitId: visit.id,
      startAt: visit.startAt?.toISOString(),
      endAt: visit.endAt?.toISOString(),
    },
    { status: 201 }
  );
}
