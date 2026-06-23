import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePortalCustomer,
  portalForbiddenResponse,
  portalUnauthorizedResponse,
} from "@/lib/portal/auth";
import { portalFeatureEnabled } from "@/lib/portal/permissions";
import { serializePortalEstimate } from "@/lib/portal/serializers";

export async function GET() {
  const ctx = await requirePortalCustomer();
  if (!ctx) return portalUnauthorizedResponse();
  if (!portalFeatureEnabled(ctx.company, "estimates")) {
    return portalForbiddenResponse("Estimates are not available in the portal");
  }

  const estimates = await prisma.estimate.findMany({
    where: {
      companyId: ctx.companyId,
      customerId: ctx.customerId,
      status: { not: "DRAFT" },
    },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    estimates: estimates.map(serializePortalEstimate),
  });
}
