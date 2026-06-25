import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageCustomers } from "@/lib/customers/permissions";
import { GoogleSearchConsoleApiError, saveSearchConsoleSite } from "@/lib/google-search-console/client";

export async function PUT(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();

    const body = await request.json();
    const siteUrl = String(body.siteUrl ?? "").trim();
    if (!siteUrl) return badRequestResponse("siteUrl is required");

    await saveSearchConsoleSite(user.companyId, siteUrl);
    return NextResponse.json({ ok: true, siteUrl });
  } catch (error) {
    if (error instanceof GoogleSearchConsoleApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return unauthorizedResponse();
  }
}
