import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getGoogleAdsConnectionStatus } from "@/lib/google-ads/client";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const status = await getGoogleAdsConnectionStatus(user.companyId);
    if (!status) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(status);
  } catch {
    return unauthorizedResponse();
  }
}
