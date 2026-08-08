import { NextResponse } from "next/server";
import { requirePortalCustomer, portalUnauthorizedResponse } from "@/lib/portal/auth";
import { getPortalBillingSummary } from "@/lib/portal/billing-summary";

export async function GET() {
  const ctx = await requirePortalCustomer();
  if (!ctx) return portalUnauthorizedResponse();

  const summary = await getPortalBillingSummary({
    companyId: ctx.companyId,
    customerId: ctx.customerId,
  });

  return NextResponse.json(summary);
}
