import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import {
  getGoogleAnalyticsSummary,
  GoogleAnalyticsApiError,
} from "@/lib/google-analytics/client";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const days = Math.min(90, Math.max(7, Number(request.nextUrl.searchParams.get("days") ?? 30)));
    const summary = await getGoogleAnalyticsSummary(user.companyId, days);
    return NextResponse.json(summary);
  } catch (error) {
    if (error instanceof GoogleAnalyticsApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return unauthorizedResponse();
  }
}
