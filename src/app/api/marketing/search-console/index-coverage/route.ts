import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import {
  getSearchConsoleIndexCoverage,
  GoogleSearchConsoleApiError,
} from "@/lib/google-search-console/client";

export const maxDuration = 60;

export async function GET() {
  try {
    const user = await requireSessionUser();
    const data = await getSearchConsoleIndexCoverage(user.companyId);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof GoogleSearchConsoleApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json({ error: "Failed to check Search Console index coverage" }, { status: 500 });
  }
}
