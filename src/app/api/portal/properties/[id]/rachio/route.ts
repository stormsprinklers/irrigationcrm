import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePortalCustomer,
  portalForbiddenResponse,
  portalNotFoundResponse,
  portalUnauthorizedResponse,
} from "@/lib/portal/auth";
import { portalFeatureEnabled } from "@/lib/portal/permissions";
import {
  fetchRachioCurrentSchedule,
  fetchRachioEvents,
  fetchRachioSchedules,
  getPortalRachioOverview,
} from "@/lib/portal/rachio";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const ctx = await requirePortalCustomer();
  if (!ctx) return portalUnauthorizedResponse();
  if (!portalFeatureEnabled(ctx.company, "rachio")) {
    return portalForbiddenResponse("Smart irrigation is not available in the portal");
  }

  const { id: propertyId } = await params;
  const property = await prisma.customerProperty.findFirst({
    where: { id: propertyId, customerId: ctx.customerId, companyId: ctx.companyId },
  });
  if (!property) return portalNotFoundResponse();

  try {
    const overview = await getPortalRachioOverview(
      ctx.companyId,
      ctx.customerId,
      propertyId
    );
    if (!overview) {
      return NextResponse.json({ linked: false });
    }

    const [schedules, current, events] = await Promise.all([
      fetchRachioSchedules(ctx.companyId, ctx.customerId, propertyId).catch(() => null),
      fetchRachioCurrentSchedule(ctx.companyId, ctx.customerId, propertyId).catch(() => null),
      fetchRachioEvents(ctx.companyId, ctx.customerId, propertyId, 30).catch(() => []),
    ]);

    return NextResponse.json({
      linked: true,
      allowRun: ctx.company.portalRachioAllowRun,
      ...overview,
      schedules,
      current,
      events,
    });
  } catch {
    return NextResponse.json({ linked: false });
  }
}
