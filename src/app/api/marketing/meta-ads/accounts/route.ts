import { NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageCustomers } from "@/lib/customers/permissions";
import { MetaAdsApiError, listMetaAdAccounts } from "@/lib/meta/ads";

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();

    const accounts = await listMetaAdAccounts(user.companyId);
    return NextResponse.json({ accounts });
  } catch (error) {
    if (error instanceof MetaAdsApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Failed to load Meta ad accounts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
