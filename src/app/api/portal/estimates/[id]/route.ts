import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePortalCustomer,
  portalForbiddenResponse,
  portalNotFoundResponse,
} from "@/lib/portal/auth";
import { portalFeatureEnabled } from "@/lib/portal/permissions";
import { serializePortalEstimate } from "@/lib/portal/serializers";
import {
  findEstimateByPublicToken,
  portalCompanyPayload,
} from "@/lib/portal/public-estimate";

type Params = { params: Promise<{ id: string }> };

async function loadEstimate(companyId: string, customerId: string, idOrToken: string) {
  return prisma.estimate.findFirst({
    where: {
      companyId,
      customerId,
      OR: [{ id: idOrToken }, { publicToken: idOrToken }],
      status: { not: "DRAFT" },
    },
    include: { lineItems: { orderBy: { sortOrder: "asc" } }, options: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const ctx = await requirePortalCustomer();

  if (ctx) {
    if (!portalFeatureEnabled(ctx.company, "estimates")) {
      return portalForbiddenResponse("Estimates are not available in the portal");
    }
    const estimate = await loadEstimate(ctx.companyId, ctx.customerId, id);
    if (!estimate) return portalNotFoundResponse();
    return NextResponse.json({
      estimate: serializePortalEstimate(estimate),
      company: portalCompanyPayload(ctx.company),
      authenticated: true,
    });
  }

  // Unauthenticated: estimate link from SMS/email uses publicToken only.
  const estimate = await findEstimateByPublicToken(id);
  if (!estimate) return portalNotFoundResponse();

  return NextResponse.json({
    estimate: serializePortalEstimate(estimate),
    company: portalCompanyPayload(estimate.company),
    authenticated: false,
  });
}
