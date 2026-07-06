import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { GoogleAdsApiError, getGoogleAdsSummary } from "@/lib/google-ads/client";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const days = Number(request.nextUrl.searchParams.get("days") ?? 30);
    const summary = await getGoogleAdsSummary(user.companyId, days);
    return NextResponse.json(summary);
  } catch (error) {
    if (error instanceof GoogleAdsApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Failed to load Google Ads data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
