import { NextRequest, NextResponse } from "next/server";
import { SocialPostSubmissionStatus } from "@prisma/client";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { canSubmitSocialPosts } from "@/lib/marketing/social-permissions";
import {
  otherPlatform,
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
    const source = await prisma.socialPostSubmission.findFirst({
      where: { id, companyId: user.companyId },
      include: { media: { orderBy: { sortOrder: "asc" } } },
    });
    if (!source) return notFoundResponse();

    if (
      source.status !== SocialPostSubmissionStatus.APPROVED &&
      source.status !== SocialPostSubmissionStatus.SCHEDULED &&
      source.status !== SocialPostSubmissionStatus.DRAFT
    ) {
      return badRequestResponse("This post cannot be copied to another platform.");
    }

    const targetPlatform = otherPlatform(source.platform);
    const copyStatus =
      source.status === SocialPostSubmissionStatus.APPROVED ||
      source.status === SocialPostSubmissionStatus.SCHEDULED
        ? SocialPostSubmissionStatus.APPROVED
        : SocialPostSubmissionStatus.DRAFT;

    const copy = await prisma.socialPostSubmission.create({
      data: {
        companyId: user.companyId,
        platform: targetPlatform,
        postType: source.postType,
        caption: source.caption,
        status: copyStatus,
        approvedAt: copyStatus === SocialPostSubmissionStatus.APPROVED ? new Date() : null,
        copiedFromId: source.id,
        createdById: user.id,
        media: {
          create: source.media.map((item) => ({
            blobUrl: item.blobUrl,
            fileName: item.fileName,
            mimeType: item.mimeType,
            sortOrder: item.sortOrder,
          })),
        },
      },
      include: submissionInclude,
    });

    return NextResponse.json({ submission: serializeSubmission(copy) });
  } catch {
    return unauthorizedResponse();
  }
}
