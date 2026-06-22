import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getGbpAccountsForCompany, GoogleBusinessApiError } from "@/lib/google-business/client";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const refresh = request.nextUrl.searchParams.get("refresh") === "1";
    const result = await getGbpAccountsForCompany(user.companyId, { refresh });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load accounts";
    const status = err instanceof GoogleBusinessApiError ? err.status : 500;
    return NextResponse.json({ error: message }, { status: status || 500 });
  }
}
