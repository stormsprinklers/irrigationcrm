import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePortalCustomer,
  portalForbiddenResponse,
  portalNotFoundResponse,
} from "@/lib/portal/auth";
import { portalFeatureEnabled } from "@/lib/portal/permissions";
import { findEstimateByPublicToken } from "@/lib/portal/public-estimate";
import { sendEstimateFinancingSms } from "@/lib/estimates/financing";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await requirePortalCustomer();

  let estimateId: string | null = null;
  let companyId: string | null = null;

  if (ctx) {
    if (!portalFeatureEnabled(ctx.company, "estimates")) {
      return portalForbiddenResponse("Estimates are not available in the portal");
    }
    const estimate = await prisma.estimate.findFirst({
      where: {
        companyId: ctx.companyId,
        customerId: ctx.customerId,
        OR: [{ id }, { publicToken: id }],
        status: { not: "DRAFT" },
      },
      select: { id: true, companyId: true },
    });
    if (estimate) {
      estimateId = estimate.id;
      companyId = estimate.companyId;
    }
  } else {
    const estimate = await findEstimateByPublicToken(id);
    if (estimate) {
      estimateId = estimate.id;
      companyId = estimate.companyId;
    }
  }

  if (!estimateId || !companyId) return portalNotFoundResponse();

  const result = await sendEstimateFinancingSms({ companyId, estimateId });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, financingUrl: result.financingUrl ?? null },
      { status: result.status }
    );
  }
  return NextResponse.json(result);
}
