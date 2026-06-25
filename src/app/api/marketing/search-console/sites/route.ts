import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { GoogleSearchConsoleApiError, listSearchConsoleSites } from "@/lib/google-search-console/client";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const sites = await listSearchConsoleSites(user.companyId);
    return NextResponse.json({ sites });
  } catch (error) {
    if (error instanceof GoogleSearchConsoleApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return unauthorizedResponse();
  }
}
