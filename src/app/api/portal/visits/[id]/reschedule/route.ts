import { NextRequest, NextResponse } from "next/server";
import { VisitStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { onVisitTimeChanged } from "@/lib/notifications/visit-events";
import {
  requirePortalCustomer,
  portalForbiddenResponse,
  portalNotFoundResponse,
  portalUnauthorizedResponse,
} from "@/lib/portal/auth";
import { portalFeatureEnabled } from "@/lib/portal/permissions";
import {
  assertSlotAvailable,
  assertVisitReschedulable,
  assertVisitWithinLeadHours,
  getCustomerVisit,
} from "@/lib/portal/scheduling";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const ctx = await requirePortalCustomer();
  if (!ctx) return portalUnauthorizedResponse();
  if (!portalFeatureEnabled(ctx.company, "jobs")) {
    return portalForbiddenResponse("Jobs are not available in the portal");
  }
  if (ctx.customer.doNotService) {
    return portalForbiddenResponse("Scheduling is not available for this account");
  }

  const { id } = await params;
  const visit = await getCustomerVisit(ctx.companyId, ctx.customerId, id);
  if (!visit) return portalNotFoundResponse();

  try {
    assertVisitReschedulable(visit.status);
    if (visit.startAt) {
      assertVisitWithinLeadHours(
        visit.startAt,
        ctx.company.portalRescheduleLeadHours,
        "reschedule"
      );
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cannot reschedule" },
      { status: 400 }
    );
  }

  const body = await request.json();
  const { startAt, endAt } = body as { startAt?: string; endAt?: string };
  if (!startAt || !endAt) {
    return NextResponse.json({ error: "startAt and endAt are required" }, { status: 400 });
  }

  const slotStart = new Date(startAt);
  const slotEnd = new Date(endAt);
  if (Number.isNaN(slotStart.getTime()) || Number.isNaN(slotEnd.getTime())) {
    return NextResponse.json({ error: "Invalid dates" }, { status: 400 });
  }

  try {
    await assertSlotAvailable(ctx.company, slotStart, slotEnd);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Slot unavailable" },
      { status: 409 }
    );
  }

  const updated = await prisma.visit.update({
    where: { id },
    data: {
      startAt: slotStart,
      endAt: slotEnd,
      status: VisitStatus.SCHEDULED,
    },
    include: {
      assignedUser: { select: { name: true, photoUrl: true, title: true } },
      property: {
        select: { id: true, name: true, address: true, city: true, state: true, zip: true },
      },
    },
  });

  void onVisitTimeChanged({ visitId: id, companyId: ctx.companyId }).catch(() => {});

  return NextResponse.json({ ok: true });
}
