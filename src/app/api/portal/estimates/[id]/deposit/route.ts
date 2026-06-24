import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePortalCustomer,
  portalForbiddenResponse,
  portalNotFoundResponse,
  portalUnauthorizedResponse,
} from "@/lib/portal/auth";
import { portalFeatureEnabled } from "@/lib/portal/permissions";
import { createEstimateDepositCheckout } from "@/lib/estimates/deposit-checkout";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const ctx = await requirePortalCustomer();
  if (!ctx) return portalUnauthorizedResponse();
  if (!portalFeatureEnabled(ctx.company, "estimates")) {
    return portalForbiddenResponse("Estimates are not available in the portal");
  }

  const { id } = await params;
  const estimate = await prisma.estimate.findFirst({
    where: {
      companyId: ctx.companyId,
      customerId: ctx.customerId,
      OR: [{ id }, { publicToken: id }],
      status: "APPROVED",
      depositRequired: true,
    },
  });
  if (!estimate) return portalNotFoundResponse();

  const origin = request.nextUrl.origin;
  const slug = ctx.company.portalSlug ?? "portal";

  try {
    const checkout = await createEstimateDepositCheckout({
      estimateId: estimate.id,
      successUrl: `${origin}/portal/${slug}/estimates/${estimate.publicToken}?deposit=success`,
      cancelUrl: `${origin}/portal/${slug}/estimates/${estimate.publicToken}?deposit=cancelled`,
    });
    return NextResponse.json({ url: checkout.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Deposit checkout failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
