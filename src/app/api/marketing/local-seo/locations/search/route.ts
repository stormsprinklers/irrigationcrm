import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import {
  getUtahLocationStats,
  searchUtahLocations,
} from "@/lib/local-seo/utah-locations";

export async function GET(request: NextRequest) {
  try {
    await requireSessionUser();
    const query = request.nextUrl.searchParams.get("q") ?? "";
    const limitParam = Number(request.nextUrl.searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(limitParam) ? Math.min(500, Math.max(1, limitParam)) : 50;

    const locations = searchUtahLocations(query, limit);
    const stats = getUtahLocationStats();

    return NextResponse.json({
      locations,
      source: "utah-catalog",
      totalUtahLocations: stats.total,
      totalUtahCities: stats.cities,
      totalUtahPostalCodes: stats.postalCodes,
      showing: locations.length,
    });
  } catch {
    return unauthorizedResponse();
  }
}
