import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { canManageCustomers } from "@/lib/customers/permissions";
import { GoogleAdsApiError, saveGoogleAdsCustomer } from "@/lib/google-ads/client";

export async function PUT(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();

    const body = await request.json();
    const customerId = String(body.customerId ?? "").trim();
    const customerName = String(body.customerName ?? "").trim();
    const loginCustomerId = body.loginCustomerId
      ? String(body.loginCustomerId).trim()
      : null;

    if (!customerId) return badRequestResponse("customerId is required");
    if (!customerName) return badRequestResponse("customerName is required");

    await saveGoogleAdsCustomer(user.companyId, customerId, customerName, loginCustomerId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof GoogleAdsApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Failed to save Google Ads account";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
