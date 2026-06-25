import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { canManageCustomers } from "@/lib/customers/permissions";
import {
  GoogleAnalyticsApiError,
  saveGoogleAnalyticsProperty,
} from "@/lib/google-analytics/client";

export async function PUT(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();

    const body = await request.json();
    const propertyId = String(body.propertyId ?? "").trim();
    if (!propertyId) return badRequestResponse("propertyId is required");

    await saveGoogleAnalyticsProperty(user.companyId, propertyId);
    return NextResponse.json({ ok: true, propertyId });
  } catch (error) {
    if (error instanceof GoogleAnalyticsApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return unauthorizedResponse();
  }
}
