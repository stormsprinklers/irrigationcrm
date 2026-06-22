import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getGbpLocationsForCompany, GoogleBusinessApiError } from "@/lib/google-business/client";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const accountId = request.nextUrl.searchParams.get("accountId");
    if (!accountId) return badRequestResponse("accountId is required");

    const refresh = request.nextUrl.searchParams.get("refresh") === "1";
    const result = await getGbpLocationsForCompany(user.companyId, accountId, { refresh });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load locations";
    const status = err instanceof GoogleBusinessApiError ? err.status : 500;
    return NextResponse.json({ error: message }, { status: status || 500 });
  }
}
