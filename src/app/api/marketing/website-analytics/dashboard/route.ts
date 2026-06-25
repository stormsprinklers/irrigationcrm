import { NextRequest, NextResponse } from "next/server";
import { subDays } from "date-fns";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getWebsiteAnalyticsReport } from "@/lib/marketing/website-analytics";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const days = Math.min(90, Math.max(7, Number(request.nextUrl.searchParams.get("days") ?? 30)));
    const to = new Date();
    const from = subDays(to, days);

    const report = await getWebsiteAnalyticsReport(user.companyId, { from, to });
    return NextResponse.json({ ...report, from: from.toISOString(), to: to.toISOString(), days });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Failed to load website analytics";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
