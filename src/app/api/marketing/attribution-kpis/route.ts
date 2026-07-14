import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { parseAdsDateRange } from "@/lib/marketing/ads-date-range";
import { getAttributionKpis } from "@/lib/marketing/attribution-kpis";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const dateRange = parseAdsDateRange(request.nextUrl.searchParams);
    const kpis = await getAttributionKpis(user.companyId, dateRange);
    return NextResponse.json(kpis);
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = err instanceof Error ? err.message : "Failed to load attribution KPIs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
