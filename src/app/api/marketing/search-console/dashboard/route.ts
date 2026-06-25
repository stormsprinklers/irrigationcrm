import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import {
  getSearchConsoleDashboard,
  GoogleSearchConsoleApiError,
} from "@/lib/google-search-console/client";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const days = Math.min(90, Math.max(7, Number(request.nextUrl.searchParams.get("days") ?? 30)));
    const data = await getSearchConsoleDashboard(user.companyId, days);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof GoogleSearchConsoleApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Failed to load Search Console data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
