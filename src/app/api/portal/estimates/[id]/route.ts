import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePortalCustomer,
  portalForbiddenResponse,
  portalNotFoundResponse,
  portalUnauthorizedResponse,
} from "@/lib/portal/auth";
import { portalFeatureEnabled } from "@/lib/portal/permissions";
import { serializePortalEstimate } from "@/lib/portal/serializers";

type Params = { params: Promise<{ id: string }> };

async function loadEstimate(companyId: string, customerId: string, idOrToken: string) {
  return prisma.estimate.findFirst({
    where: {
      companyId,
      customerId,
      OR: [{ id: idOrToken }, { publicToken: idOrToken }],
      status: { not: "DRAFT" },
    },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function GET(_request: NextRequest, { params }: Params) {
  const ctx = await requirePortalCustomer();
  if (!ctx) return portalUnauthorizedResponse();
  if (!portalFeatureEnabled(ctx.company, "estimates")) {
    return portalForbiddenResponse("Estimates are not available in the portal");
  }

  const { id } = await params;
  const estimate = await loadEstimate(ctx.companyId, ctx.customerId, id);
  if (!estimate) return portalNotFoundResponse();

  return NextResponse.json({ estimate: serializePortalEstimate(estimate) });
}
