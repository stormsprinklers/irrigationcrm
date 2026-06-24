import { SocialPostSubmissionStatus } from "@prisma/client";
import { resolveMediaUrlForMeta } from "@/lib/marketing/media-url";
import { publishSocialSubmission } from "@/lib/meta/publish";
import { resolvePageAccessToken } from "@/lib/meta/token";
import { prisma } from "@/lib/prisma";

export async function processDueSocialPosts(limit = 20) {
  const due = await prisma.socialPostSubmission.findMany({
    where: {
      status: SocialPostSubmissionStatus.SCHEDULED,
      scheduledAt: { lte: new Date() },
    },
    include: { media: { orderBy: { sortOrder: "asc" } } },
    orderBy: { scheduledAt: "asc" },
    take: limit,
  });

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (const submission of due) {
    try {
      await prisma.socialPostSubmission.update({
        where: { id: submission.id },
        data: { status: SocialPostSubmissionStatus.PUBLISHING },
      });

      const company = await prisma.company.findUnique({
        where: { id: submission.companyId },
        select: {
          metaPageId: true,
          metaInstagramAccountId: true,
          metaPageAccessToken: true,
          metaAppId: true,
          metaAppSecret: true,
        },
      });

      if (!company?.metaPageId || !company.metaPageAccessToken) {
        throw new Error("Meta Page ID or access token is not configured.");
      }

      const resolved = await resolvePageAccessToken({
        token: company.metaPageAccessToken,
        pageId: company.metaPageId,
        appId: company.metaAppId,
        appSecret: company.metaAppSecret,
      });

      const published = await publishSocialSubmission({
        platform: submission.platform,
        pageId: company.metaPageId,
        instagramAccountId: company.metaInstagramAccountId,
        pageAccessToken: resolved.pageToken,
        caption: submission.caption,
        mediaUrls: submission.media.map((item) => resolveMediaUrlForMeta(item.blobUrl)),
        scheduledAt: null,
      });

      await prisma.socialPostSubmission.update({
        where: { id: submission.id },
        data: {
          status: SocialPostSubmissionStatus.PUBLISHED,
          publishedAt: new Date(),
          externalPostId: published.externalPostId,
          permalink: published.permalink,
          publishError: null,
        },
      });

      results.push({ id: submission.id, ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Publish failed";
      await prisma.socialPostSubmission.update({
        where: { id: submission.id },
        data: {
          status: SocialPostSubmissionStatus.FAILED,
          publishError: message,
        },
      });
      results.push({ id: submission.id, ok: false, error: message });
    }
  }

  return { processed: results.length, results };
}
