import { NextRequest, NextResponse } from "next/server";
import { GbpReviewAssignStatus } from "@prisma/client";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { canHandleGbpReviews } from "@/lib/google-business/permissions";
import { REVIEW_ALIAS_ROLES } from "@/lib/google-business/review-aliases";
import { manuallyAssignGbpReview } from "@/lib/google-business/review-assigner";
import { prisma } from "@/lib/prisma";

function serializeReview(
  review: {
    id: string;
    reviewId: string;
    reviewerName: string;
    comment: string | null;
    starRating: string;
    createTime: Date | null;
    status: GbpReviewAssignStatus;
    assignments: Array<{ share: { toNumber?: () => number } | number; user: { id: string; name: string } }>;
  }
) {
  return {
    id: review.id,
    reviewId: review.reviewId,
    reviewerName: review.reviewerName,
    comment: review.comment,
    starRating: review.starRating,
    createTime: review.createTime?.toISOString() ?? null,
    status: review.status,
    assignments: review.assignments.map((row) => ({
      userId: row.user.id,
      name: row.user.name,
      share: typeof row.share === "number" ? row.share : Number(row.share),
    })),
  };
}

export async function GET() {
  try {
    const user = await requireSessionUser();
    const [needsReview, assigned, technicians] = await Promise.all([
      prisma.gbpReview.findMany({
        where: { companyId: user.companyId, status: GbpReviewAssignStatus.NEEDS_REVIEW },
        include: { assignments: { include: { user: { select: { id: true, name: true } } } } },
        orderBy: { createTime: "desc" },
      }),
      prisma.gbpReview.findMany({
        where: { companyId: user.companyId, status: GbpReviewAssignStatus.ASSIGNED },
        include: { assignments: { include: { user: { select: { id: true, name: true } } } } },
      }),
      prisma.user.findMany({
        where: { companyId: user.companyId, status: "ACTIVE", role: { in: REVIEW_ALIAS_ROLES } },
        select: { id: true, name: true },
        orderBy: { firstName: "asc" },
      }),
    ]);

    const byGoogleReviewId: Record<string, ReturnType<typeof serializeReview>["assignments"]> = {};
    for (const review of assigned) {
      byGoogleReviewId[review.reviewId] = serializeReview(review).assignments;
    }

    return NextResponse.json({
      needsReview: needsReview.map(serializeReview),
      assignmentsByGoogleReviewId: byGoogleReviewId,
      technicians,
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canHandleGbpReviews(user.role)) return forbiddenResponse();

    const body = await request.json();
    const reviewId = String(body.reviewId ?? "").trim();
    const userIds = Array.isArray(body.userIds) ? body.userIds.map(String) : [];
    if (!reviewId) return badRequestResponse("reviewId is required");
    if (!userIds.length) return badRequestResponse("Select at least one technician");

    const updated = await manuallyAssignGbpReview(user.companyId, reviewId, userIds);
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json(serializeReview(updated));
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json({ error: "Failed to assign review" }, { status: 500 });
  }
}
