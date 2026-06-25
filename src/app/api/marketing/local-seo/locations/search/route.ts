import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { searchSampleLocations } from "@/lib/local-seo/sample-locations";

export async function GET(request: NextRequest) {
  try {
    await requireSessionUser();
    const query = request.nextUrl.searchParams.get("q") ?? "";
    const locations = searchSampleLocations(query);
    return NextResponse.json({
      locations,
      source: "sample",
      note: "Sample Utah cities for development. SerpAPI location search will replace this.",
    });
  } catch {
    return unauthorizedResponse();
  }
}
