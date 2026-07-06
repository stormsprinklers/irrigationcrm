import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { GoogleBusinessApiError, requireGbpCompany } from "@/lib/google-business/client";
import { listGbpReviews } from "@/lib/google-business/v4-api";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const company = await requireGbpCompany(user.companyId);
    const pageToken = request.nextUrl.searchParams.get("pageToken") ?? undefined;

    const data = await listGbpReviews(
      user.companyId,
      company.googleBusinessAccountId!,
      company.googleBusinessLocationId!,
      pageToken
    );

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof GoogleBusinessApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Failed to load reviews";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
