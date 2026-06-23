import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePortalCustomer,
  portalForbiddenResponse,
  portalNotFoundResponse,
  portalUnauthorizedResponse,
} from "@/lib/portal/auth";
import { portalFeatureEnabled } from "@/lib/portal/permissions";
import { runPortalRachioZone } from "@/lib/portal/rachio";

type Params = { params: Promise<{ id: string; zoneId: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  const ctx = await requirePortalCustomer();
  if (!ctx) return portalUnauthorizedResponse();
  if (!portalFeatureEnabled(ctx.company, "rachio") || !ctx.company.portalRachioAllowRun) {
    return portalForbiddenResponse("Manual zone runs are not enabled");
  }

  const { id: propertyId, zoneId } = await params;
  const property = await prisma.customerProperty.findFirst({
    where: { id: propertyId, customerId: ctx.customerId, companyId: ctx.companyId },
  });
  if (!property) return portalNotFoundResponse();

  const body = await request.json();
  const durationMinutes = Number(body.durationMinutes ?? 5);
  if (!Number.isFinite(durationMinutes) || durationMinutes < 1 || durationMinutes > 30) {
    return NextResponse.json({ error: "durationMinutes must be 1–30" }, { status: 400 });
  }

  try {
    const result = await runPortalRachioZone(
      ctx.companyId,
      ctx.customerId,
      propertyId,
      zoneId,
      durationMinutes
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start zone" },
      { status: 400 }
    );
  }
}
