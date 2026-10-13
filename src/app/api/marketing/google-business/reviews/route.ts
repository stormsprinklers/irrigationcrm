import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { GoogleBusinessApiError, requireGbpCompany } from "@/lib/google-business/client";
import { listAllGbpReviews } from "@/lib/google-business/v4-api";
import {
  assignPendingGbpReviews,
  reconcileMissingGbpReviews,
  upsertGbpReviews,
} from "@/lib/google-business/review-assigner";
import { notifyStaffOfNewGbpReviews } from "@/lib/google-business/review-staff-notifier";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const company = await requireGbpCompany(user.companyId);
    const data = await listAllGbpReviews(
      user.companyId,
      company.googleBusinessAccountId!,
      company.googleBusinessLocationId!
    );

    await upsertGbpReviews(user.companyId, data.reviews);
    await reconcileMissingGbpReviews(
      user.companyId,
      data.reviews.map((review) => review.reviewId),
      data.complete
    );
    await assignPendingGbpReviews(user.companyId).catch((error) => {
      console.error("GBP review assignment failed", error);
    });
    await notifyStaffOfNewGbpReviews(user.companyId).catch((error) => {
      console.error("GBP review staff notify failed", error);
    });

    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
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
