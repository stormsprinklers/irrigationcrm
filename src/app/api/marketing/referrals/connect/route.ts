import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageCustomers } from "@/lib/customers/permissions";
import { verifyCompanyStripeConnect } from "@/lib/referrals/stripe-connect";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();

    const status = await verifyCompanyStripeConnect(user.companyId);
    return NextResponse.json(status);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Failed to connect Stripe";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
