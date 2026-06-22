import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getCompanyAccessToken, listGbpAccounts } from "@/lib/google-business/client";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const accessToken = await getCompanyAccessToken(user.companyId);
    const accounts = await listGbpAccounts(accessToken);
    return NextResponse.json({ accounts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load accounts";
    const status = err && typeof err === "object" && "status" in err ? Number(err.status) : 500;
    return NextResponse.json({ error: message }, { status: status || 500 });
  }
}
