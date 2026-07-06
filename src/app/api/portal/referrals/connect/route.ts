import { NextRequest, NextResponse } from "next/server";
import {
  requirePortalCustomer,
  portalForbiddenResponse,
  portalUnauthorizedResponse,
} from "@/lib/portal/auth";
import { portalFeatureEnabled } from "@/lib/portal/permissions";
import { createReferrerConnectLink } from "@/lib/referrals/stripe-connect";

export async function POST(request: NextRequest) {
  const ctx = await requirePortalCustomer();
  if (!ctx) return portalUnauthorizedResponse();
  if (!portalFeatureEnabled(ctx.company, "referrals")) {
    return portalForbiddenResponse("Referrals are not available in the portal");
  }
  if (!ctx.company.portalSlug) {
    return NextResponse.json({ error: "Portal is not configured" }, { status: 400 });
  }

  try {
    const base = `/portal/${ctx.company.portalSlug}/referrals`;
    const link = await createReferrerConnectLink({
      companyId: ctx.companyId,
      customerId: ctx.customerId,
      origin: request.nextUrl.origin,
      refreshPath: `${base}?connect=refresh`,
      returnPath: `${base}?connect=return`,
    });
    return NextResponse.json(link);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start payout setup";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
