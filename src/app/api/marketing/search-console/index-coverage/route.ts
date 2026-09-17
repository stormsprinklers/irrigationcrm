import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import {
  getSearchConsoleIndexCoverage,
  GoogleSearchConsoleApiError,
} from "@/lib/google-search-console/client";

export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const rawOffset = new URL(request.url).searchParams.get("offset") ?? "0";
    const offset = Number(rawOffset);
    if (!Number.isInteger(offset) || offset < 0 || offset > 150) {
      return NextResponse.json({ error: "Invalid coverage offset" }, { status: 400 });
    }
    const data = await getSearchConsoleIndexCoverage(user.companyId, offset);
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
