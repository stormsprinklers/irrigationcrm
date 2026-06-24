import { NextRequest, NextResponse } from "next/server";
import { SocialPostSubmissionStatus } from "@prisma/client";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { canBypassSocialReview, canSubmitSocialPosts } from "@/lib/marketing/social-permissions";
import {
  canEditSubmission,
  serializeSubmission,
  submissionInclude,
} from "@/lib/marketing/social-submissions";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    if (!canSubmitSocialPosts(user.role)) return forbiddenResponse();

    const { id } = await context.params;
    const existing = await prisma.socialPostSubmission.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!existing) return notFoundResponse();
    if (!canEditSubmission(existing, user.id, user.role)) return forbiddenResponse();

    if (
      existing.status !== SocialPostSubmissionStatus.DRAFT &&
      existing.status !== SocialPostSubmissionStatus.REVISION_REQUESTED
    ) {
      return badRequestResponse("Only drafts or revision requests can be submitted for review.");
    }

    const submission = await prisma.socialPostSubmission.update({
      where: { id },
      data: canBypassSocialReview(user.role)
        ? {
            status: SocialPostSubmissionStatus.APPROVED,
            submittedAt: new Date(),
            approvedAt: new Date(),
            reviewedAt: new Date(),
            reviewedById: user.id,
          }
        : {
            status: SocialPostSubmissionStatus.PENDING_REVIEW,
            submittedAt: new Date(),
          },
      include: submissionInclude,
    });

    return NextResponse.json({ submission: serializeSubmission(submission) });
  } catch {
    return unauthorizedResponse();
  }
}
