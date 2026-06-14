import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getHomeSummary } from "@/lib/home/queries";
import type { HomeDateRange } from "@/lib/home/types";

const VALID_RANGES: HomeDateRange[] = ["ytd", "mtd", "last30"];

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const rangeParam = request.nextUrl.searchParams.get("range") ?? "ytd";
    const dateRange = VALID_RANGES.includes(rangeParam as HomeDateRange)
      ? (rangeParam as HomeDateRange)
      : "ytd";

    const summary = await getHomeSummary(user.companyId, dateRange);
    return NextResponse.json({
      ...summary,
      greeting: user.name.split(" ")[0] ?? user.name,
    });
  } catch {
    return unauthorizedResponse();
  }
}
