import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePortalCustomer,
  portalForbiddenResponse,
  portalNotFoundResponse,
} from "@/lib/portal/auth";
import { portalFeatureEnabled } from "@/lib/portal/permissions";
import { createEstimateDepositCheckout } from "@/lib/estimates/deposit-checkout";
import { resolvePortalSlug } from "@/lib/portal/company";
import { findEstimateByPublicToken } from "@/lib/portal/public-estimate";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const ctx = await requirePortalCustomer();

  let estimateId: string | null = null;
  let publicToken: string | null = null;
  let slugSource: { portalSlug: string | null; bookingSlug: string | null } | null = null;

  if (ctx) {
    if (!portalFeatureEnabled(ctx.company, "estimates")) {
      return portalForbiddenResponse("Estimates are not available in the portal");
    }
    const estimate = await prisma.estimate.findFirst({
      where: {
        companyId: ctx.companyId,
        customerId: ctx.customerId,
        OR: [{ id }, { publicToken: id }],
        status: "APPROVED",
        depositRequired: true,
      },
    });
    if (estimate) {
      estimateId = estimate.id;
      publicToken = estimate.publicToken;
      slugSource = ctx.company;
    }
  } else {
    const estimate = await findEstimateByPublicToken(id);
    if (estimate?.status === "APPROVED" && estimate.depositRequired) {
      estimateId = estimate.id;
      publicToken = estimate.publicToken;
      slugSource = estimate.company;
    }
  }

  if (!estimateId || !publicToken || !slugSource) {
    return portalNotFoundResponse();
  }

  const origin = request.nextUrl.origin;
  const slug = resolvePortalSlug(slugSource) ?? "portal";

  try {
    const checkout = await createEstimateDepositCheckout({
      estimateId,
      successUrl: `${origin}/portal/${slug}/estimates/${publicToken}?deposit=success`,
      cancelUrl: `${origin}/portal/${slug}/estimates/${publicToken}?deposit=cancelled`,
    });
    return NextResponse.json({ url: checkout.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Deposit checkout failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
