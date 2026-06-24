import { NextRequest, NextResponse } from "next/server";
import { SocialPostSubmissionStatus } from "@prisma/client";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { canReviewSocialPosts } from "@/lib/marketing/social-permissions";
import { serializeSubmission, submissionInclude } from "@/lib/marketing/social-submissions";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    if (!canReviewSocialPosts(user.role)) return forbiddenResponse();

    const { id } = await context.params;
    const body = await request.json();
    const comment = typeof body.comment === "string" ? body.comment.trim() : "";
    if (!comment) {
      return badRequestResponse("Revision comment is required.");
    }

    const existing = await prisma.socialPostSubmission.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!existing) return notFoundResponse();
    if (existing.status !== SocialPostSubmissionStatus.PENDING_REVIEW) {
      return badRequestResponse("Only pending submissions can be sent back for revision.");
    }

    const submission = await prisma.$transaction(async (tx) => {
      await tx.socialPostReviewComment.create({
        data: {
          submissionId: id,
          authorId: user.id,
          body: comment,
          isRevisionRequest: true,
        },
      });
      return tx.socialPostSubmission.update({
        where: { id },
        data: {
          status: SocialPostSubmissionStatus.REVISION_REQUESTED,
          reviewedAt: new Date(),
          reviewedById: user.id,
        },
        include: submissionInclude,
      });
    });

    return NextResponse.json({ submission: serializeSubmission(submission) });
  } catch {
    return unauthorizedResponse();
  }
}
