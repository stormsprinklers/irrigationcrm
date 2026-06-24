import {
  SocialPostSubmissionStatus,
  type Prisma,
  type SocialPostSubmission,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const submissionInclude = {
  createdBy: { select: { id: true, name: true, role: true } },
  reviewedBy: { select: { id: true, name: true, role: true } },
  copiedFrom: { select: { id: true, platform: true, caption: true } },
  media: { orderBy: { sortOrder: "asc" as const } },
  comments: {
    orderBy: { createdAt: "asc" as const },
    include: { author: { select: { id: true, name: true, role: true } } },
  },
} satisfies Prisma.SocialPostSubmissionInclude;

export type SubmissionWithRelations = Prisma.SocialPostSubmissionGetPayload<{
  include: typeof submissionInclude;
}>;

export function serializeSubmission(submission: SubmissionWithRelations) {
  return {
    id: submission.id,
    platform: submission.platform as "facebook" | "instagram",
    postType: submission.postType,
    caption: submission.caption,
    status: submission.status,
    scheduledAt: submission.scheduledAt?.toISOString() ?? null,
    publishedAt: submission.publishedAt?.toISOString() ?? null,
    submittedAt: submission.submittedAt?.toISOString() ?? null,
    approvedAt: submission.approvedAt?.toISOString() ?? null,
    rejectedAt: submission.rejectedAt?.toISOString() ?? null,
    reviewedAt: submission.reviewedAt?.toISOString() ?? null,
    externalPostId: submission.externalPostId,
    permalink: submission.permalink,
    publishError: submission.publishError,
    copiedFromId: submission.copiedFromId,
    copiedFrom: submission.copiedFrom
      ? {
          id: submission.copiedFrom.id,
          platform: submission.copiedFrom.platform,
          caption: submission.copiedFrom.caption,
        }
      : null,
    createdBy: submission.createdBy,
    reviewedBy: submission.reviewedBy,
    media: submission.media.map((item) => ({
      id: item.id,
      blobUrl: item.blobUrl,
      fileName: item.fileName,
      mimeType: item.mimeType,
      sortOrder: item.sortOrder,
    })),
    comments: submission.comments.map((comment) => ({
      id: comment.id,
      body: comment.body,
      isRevisionRequest: comment.isRevisionRequest,
      createdAt: comment.createdAt.toISOString(),
      author: comment.author,
    })),
    createdAt: submission.createdAt.toISOString(),
    updatedAt: submission.updatedAt.toISOString(),
  };
}

export async function getSubmissionCounts(companyId: string) {
  const [pendingApprovals, scheduledPosts, revisionRequested] = await Promise.all([
    prisma.socialPostSubmission.count({
      where: { companyId, status: SocialPostSubmissionStatus.PENDING_REVIEW },
    }),
    prisma.socialPostSubmission.count({
      where: { companyId, status: SocialPostSubmissionStatus.SCHEDULED },
    }),
    prisma.socialPostSubmission.count({
      where: { companyId, status: SocialPostSubmissionStatus.REVISION_REQUESTED },
    }),
  ]);

  return { pendingApprovals, scheduledPosts, revisionRequested };
}

export function otherPlatform(platform: string): "facebook" | "instagram" {
  return platform === "instagram" ? "facebook" : "instagram";
}

export function canEditSubmission(
  submission: Pick<SocialPostSubmission, "status" | "createdById">,
  userId: string,
  role: string
) {
  if (submission.status === SocialPostSubmissionStatus.PUBLISHED) return false;
  if (submission.status === SocialPostSubmissionStatus.SCHEDULED) return false;
  if (submission.status === SocialPostSubmissionStatus.PUBLISHING) return false;
  if (role === "ADMIN" || role === "MANAGER") return true;
  return submission.createdById === userId;
}
