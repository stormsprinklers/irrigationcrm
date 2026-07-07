import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { GoogleBusinessApiError, requireGbpCompany } from "@/lib/google-business/client";
import { getCachedGbpReviewSummary } from "@/lib/google-business/v4-api";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const company = await requireGbpCompany(user.companyId);

    const refresh = request.nextUrl.searchParams.get("refresh") === "1";
    const summary = await getCachedGbpReviewSummary(
      user.companyId,
      company.googleBusinessAccountId!,
      company.googleBusinessLocationId!,
      { refresh }
    );

    return NextResponse.json(summary);
  } catch (error) {
    if (error instanceof GoogleBusinessApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Failed to load review summary";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
