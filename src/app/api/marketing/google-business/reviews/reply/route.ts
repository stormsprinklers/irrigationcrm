import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { canHandleGbpReviews } from "@/lib/google-business/permissions";
import { GoogleBusinessApiError, requireGbpCompany } from "@/lib/google-business/client";
import { updateGbpReviewReply } from "@/lib/google-business/v4-api";
import { prisma } from "@/lib/prisma";

export async function PUT(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canHandleGbpReviews(user.role)) return forbiddenResponse();

    await requireGbpCompany(user.companyId);
    const body = await request.json();
    const reviewName = String(body.reviewName ?? "").trim();
    const comment = String(body.comment ?? "").trim();
    if (!reviewName) return badRequestResponse("reviewName is required");
    if (!comment) return badRequestResponse("Reply comment is required");

    const data = await updateGbpReviewReply(user.companyId, reviewName, comment);
    const reviewId =
      String(body.reviewId ?? "").trim() || reviewName.split("/").filter(Boolean).pop() || "";
    if (reviewId) {
      await prisma.gbpReview.updateMany({
        where: { companyId: user.companyId, reviewId },
        data: { hasReply: true },
      });
    }
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof GoogleBusinessApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Failed to post review reply";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
