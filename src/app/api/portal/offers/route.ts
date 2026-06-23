import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePortalCustomer,
  portalForbiddenResponse,
  portalNotFoundResponse,
  portalUnauthorizedResponse,
} from "@/lib/portal/auth";
import { portalFeatureEnabled } from "@/lib/portal/permissions";
import { listPortalOffersForCustomer } from "@/lib/portal/offers";

export async function GET() {
  const ctx = await requirePortalCustomer();
  if (!ctx) return portalUnauthorizedResponse();
  if (!portalFeatureEnabled(ctx.company, "offers")) {
    return portalForbiddenResponse("Offers are not available in the portal");
  }

  const customer = await prisma.customer.findUnique({
    where: { id: ctx.customerId },
    select: { tags: true, zip: true },
  });
  if (!customer) return portalNotFoundResponse();

  const offers = await listPortalOffersForCustomer(ctx.companyId, customer);
  return NextResponse.json({ offers });
}
