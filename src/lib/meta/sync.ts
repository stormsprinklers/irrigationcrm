import { prisma } from "@/lib/prisma";
import { fetchMetaSocialData, type FetchedSocialPost } from "@/lib/meta/graph";
import { resolvePageAccessToken } from "@/lib/meta/token";
import type { MetaSocialDashboard, MetaSocialMetrics } from "@/lib/meta/types";

const SYNC_INTERVAL_MS = 5 * 60 * 1000;

function parseCachedMetrics(value: unknown): MetaSocialMetrics | null {
  if (!value || typeof value !== "object") return null;
  const m = value as Record<string, unknown>;
  return {
    facebookFollowers: typeof m.facebookFollowers === "number" ? m.facebookFollowers : null,
    instagramFollowers: typeof m.instagramFollowers === "number" ? m.instagramFollowers : null,
    reach7d: typeof m.reach7d === "number" ? m.reach7d : null,
    engagementRate: typeof m.engagementRate === "number" ? m.engagementRate : null,
    pendingApprovals: 0,
    scheduledPosts: 0,
  };
}

export async function upsertSocialPosts(companyId: string, posts: FetchedSocialPost[]) {
  for (const post of posts) {
    await prisma.socialPost.upsert({
      where: {
        companyId_platform_externalId: {
          companyId,
          platform: post.platform,
          externalId: post.externalId,
        },
      },
      create: {
        companyId,
        platform: post.platform,
        externalId: post.externalId,
        postType: post.postType,
        caption: post.caption,
        permalink: post.permalink,
        publishedAt: post.publishedAt,
        likes: post.likes,
        comments: post.comments,
        shares: post.shares,
        reach: post.reach,
      },
      update: {
        postType: post.postType,
        caption: post.caption,
        permalink: post.permalink,
        publishedAt: post.publishedAt,
        likes: post.likes,
        comments: post.comments,
        shares: post.shares,
        reach: post.reach,
      },
    });
  }
}

async function loadPostsFromDb(companyId: string) {
  return prisma.socialPost.findMany({
    where: { companyId },
    orderBy: { publishedAt: "desc" },
    take: 50,
  });
}

function mapDbPost(post: Awaited<ReturnType<typeof loadPostsFromDb>>[number]) {
  const engagement = post.likes + post.comments + post.shares;
  return {
    id: post.id,
    platform: post.platform as "facebook" | "instagram",
    postType: post.postType,
    caption: post.caption,
    permalink: post.permalink,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    likes: post.likes,
    comments: post.comments,
    shares: post.shares,
    reach: post.reach,
    engagement,
  };
}

export async function getMetaSocialDashboard(
  companyId: string,
  options?: { forceSync?: boolean }
): Promise<MetaSocialDashboard> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      metaAppId: true,
      metaAppSecret: true,
      metaPageId: true,
      metaInstagramAccountId: true,
      metaPageAccessToken: true,
      metaSocialSyncedAt: true,
      metaSocialMetricsJson: true,
    },
  });

  if (!company?.metaPageId) {
    return {
      configured: false,
      needsPageToken: true,
      lastSyncedAt: null,
      metrics: emptyMetrics(),
      posts: [],
      syncError: null,
    };
  }

  if (!company.metaPageAccessToken) {
    const cachedPosts = await loadPostsFromDb(companyId);
    return {
      configured: false,
      needsPageToken: true,
      lastSyncedAt: company.metaSocialSyncedAt?.toISOString() ?? null,
      metrics: emptyMetrics(),
      posts: cachedPosts.map(mapDbPost),
      syncError: null,
    };
  }

  const stale =
    !company.metaSocialSyncedAt ||
    Date.now() - company.metaSocialSyncedAt.getTime() > SYNC_INTERVAL_MS;

  let syncError: string | null = null;

  if (options?.forceSync || stale) {
    try {
      const resolved = await resolvePageAccessToken({
        token: company.metaPageAccessToken,
        pageId: company.metaPageId,
        appId: company.metaAppId ?? process.env.META_APP_ID?.trim() ?? null,
        appSecret: company.metaAppSecret,
      });

      const instagramAccountId =
        company.metaInstagramAccountId ?? resolved.instagramAccountId ?? null;

      if (
        resolved.source === "user_token" ||
        (!company.metaInstagramAccountId && resolved.instagramAccountId)
      ) {
        await prisma.company.update({
          where: { id: companyId },
          data: {
            metaPageAccessToken: resolved.pageToken,
            ...(resolved.instagramAccountId && !company.metaInstagramAccountId
              ? { metaInstagramAccountId: resolved.instagramAccountId }
              : {}),
          },
        });
      }

      const { metrics, posts } = await fetchMetaSocialData({
        pageId: company.metaPageId,
        pageAccessToken: resolved.pageToken,
        instagramAccountId,
      });

      await upsertSocialPosts(companyId, posts);
      const metricsPayload = {
        ...metrics,
        pendingApprovals: 0,
        scheduledPosts: 0,
      };
      await prisma.company.update({
        where: { id: companyId },
        data: {
          metaSocialSyncedAt: new Date(),
          metaSocialMetricsJson: metricsPayload,
        },
      });

      const dbPosts = await loadPostsFromDb(companyId);

      return {
        configured: true,
        needsPageToken: false,
        lastSyncedAt: new Date().toISOString(),
        metrics: metricsPayload,
        posts: dbPosts.map(mapDbPost),
        syncError: null,
      };
    } catch (error) {
      syncError = error instanceof Error ? error.message : "Failed to sync from Meta";
    }
  }

  const dbPosts = await loadPostsFromDb(companyId);
  const cachedMetrics = parseCachedMetrics(company.metaSocialMetricsJson) ?? emptyMetrics();

  return {
    configured: true,
    needsPageToken: false,
    lastSyncedAt: company.metaSocialSyncedAt?.toISOString() ?? null,
    metrics: cachedMetrics,
    posts: dbPosts.map(mapDbPost),
    syncError,
  };
}

function emptyMetrics() {
  return {
    facebookFollowers: null,
    instagramFollowers: null,
    reach7d: null,
    engagementRate: null,
    pendingApprovals: 0,
    scheduledPosts: 0,
  };
}

export async function upsertSocialPostFromFeedWebhook(
  companyId: string,
  value: Record<string, unknown>
) {
  const verb = typeof value.verb === "string" ? value.verb : "";
  if (verb === "remove") {
    const postId = typeof value.post_id === "string" ? value.post_id : null;
    if (postId) {
      await prisma.socialPost.deleteMany({
        where: { companyId, platform: "facebook", externalId: postId },
      });
    }
    return;
  }

  const postId = typeof value.post_id === "string" ? value.post_id : null;
  if (!postId) return;

  const item = typeof value.item === "string" ? value.item : "post";
  const message = typeof value.message === "string" ? value.message.trim() : null;
  const link = typeof value.link === "string" ? value.link : null;
  const createdTime =
    typeof value.created_time === "number"
      ? new Date(value.created_time * 1000)
      : typeof value.created_time === "string"
        ? new Date(value.created_time)
        : null;

  await prisma.socialPost.upsert({
    where: {
      companyId_platform_externalId: {
        companyId,
        platform: "facebook",
        externalId: postId,
      },
    },
    create: {
      companyId,
      platform: "facebook",
      externalId: postId,
      postType: item,
      caption: message,
      permalink: link,
      publishedAt: createdTime,
    },
    update: {
      postType: item,
      caption: message ?? undefined,
      permalink: link ?? undefined,
      publishedAt: createdTime ?? undefined,
    },
  });
}
