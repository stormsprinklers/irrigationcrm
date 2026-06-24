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
import { serializeSubmission, submissionInclude } from "@/lib/marketing/social-submissions";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    if (!canSubmitSocialPosts(user.role)) return forbiddenResponse();

    const { id } = await context.params;
    const body = await request.json();
    const scheduledAtRaw = body.scheduledAt;

    const existing = await prisma.socialPostSubmission.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!existing) return notFoundResponse();

    const canSchedule =
      existing.status === SocialPostSubmissionStatus.APPROVED ||
      (canBypassSocialReview(user.role) &&
        existing.status === SocialPostSubmissionStatus.DRAFT);

    if (!canSchedule) {
      return badRequestResponse("Only approved posts can be scheduled.");
    }

    const scheduledAt =
      scheduledAtRaw === "now" || scheduledAtRaw === null
        ? new Date()
        : new Date(scheduledAtRaw);

    if (Number.isNaN(scheduledAt.getTime())) {
      return badRequestResponse("Invalid scheduledAt.");
    }

    const now = new Date();
    const submission = await prisma.socialPostSubmission.update({
      where: { id },
      data: {
        status: SocialPostSubmissionStatus.SCHEDULED,
        scheduledAt,
        publishError: null,
        ...(existing.status === SocialPostSubmissionStatus.DRAFT
          ? {
              approvedAt: now,
              reviewedAt: now,
              reviewedById: user.id,
              submittedAt: now,
            }
          : {}),
      },
      include: submissionInclude,
    });

    return NextResponse.json({ submission: serializeSubmission(submission) });
  } catch {
    return unauthorizedResponse();
  }
}
