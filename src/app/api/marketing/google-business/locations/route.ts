import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getCompanyAccessToken, listGbpLocations } from "@/lib/google-business/client";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const accountId = request.nextUrl.searchParams.get("accountId");
    if (!accountId) return badRequestResponse("accountId is required");

    const accessToken = await getCompanyAccessToken(user.companyId);
    const locations = await listGbpLocations(accessToken, accountId);
    return NextResponse.json({ locations });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load locations";
    const status = err && typeof err === "object" && "status" in err ? Number(err.status) : 500;
    return NextResponse.json({ error: message }, { status: status || 500 });
  }
}
