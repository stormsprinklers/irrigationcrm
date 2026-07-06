import { NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageCustomers } from "@/lib/customers/permissions";
import { GoogleAdsApiError, listGoogleAdsCustomers } from "@/lib/google-ads/client";

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();

    const customers = await listGoogleAdsCustomers(user.companyId);
    return NextResponse.json({ customers });
  } catch (error) {
    if (error instanceof GoogleAdsApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Failed to load Google Ads accounts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
