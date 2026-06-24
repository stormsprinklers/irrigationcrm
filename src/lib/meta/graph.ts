const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

type GraphError = { message?: string; type?: string; code?: number };

async function graphGet<T>(path: string, params: Record<string, string>) {
  const url = new URL(path.startsWith("http") ? path : `${GRAPH_BASE}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  const res = await fetch(url.toString(), { cache: "no-store" });
  const data = (await res.json()) as T & { error?: GraphError };

  if (!res.ok || data.error) {
    throw new Error(data.error?.message ?? `Meta Graph API error (${res.status})`);
  }

  return data;
}

type PageFields = {
  fan_count?: number;
  followers_count?: number;
  name?: string;
};

type IgFields = {
  followers_count?: number;
  media_count?: number;
  username?: string;
};

type FbPostNode = {
  id: string;
  message?: string;
  created_time?: string;
  permalink_url?: string;
  shares?: { count?: number };
  likes?: { summary?: { total_count?: number } };
  comments?: { summary?: { total_count?: number } };
};

type IgMediaNode = {
  id: string;
  caption?: string;
  timestamp?: string;
  media_type?: string;
  permalink?: string;
  like_count?: number;
  comments_count?: number;
};

type InsightsResponse = {
  data?: Array<{
    name?: string;
    values?: Array<{ value?: number }>;
  }>;
};

export type FetchedSocialPost = {
  platform: "facebook" | "instagram";
  externalId: string;
  postType: string;
  caption: string | null;
  permalink: string | null;
  publishedAt: Date | null;
  likes: number;
  comments: number;
  shares: number;
  reach: number | null;
};

export async function fetchMetaSocialData(params: {
  pageId: string;
  pageAccessToken: string;
  instagramAccountId?: string | null;
}) {
  const { pageId, pageAccessToken: token, instagramAccountId } = params;

  const page = await graphGet<PageFields>(`/${pageId}`, {
    fields: "fan_count,followers_count,name",
    access_token: token,
  });

  const fbPostsResponse = await graphGet<{ data?: FbPostNode[] }>(`/${pageId}/posts`, {
    fields:
      "id,message,created_time,permalink_url,shares,likes.summary(true),comments.summary(true)",
    limit: "25",
    access_token: token,
  });

  const facebookPosts: FetchedSocialPost[] = (fbPostsResponse.data ?? []).map((post) => ({
    platform: "facebook" as const,
    externalId: post.id,
    postType: "post",
    caption: post.message?.trim() || null,
    permalink: post.permalink_url ?? null,
    publishedAt: post.created_time ? new Date(post.created_time) : null,
    likes: post.likes?.summary?.total_count ?? 0,
    comments: post.comments?.summary?.total_count ?? 0,
    shares: post.shares?.count ?? 0,
    reach: null,
  }));

  let instagramFollowers: number | null = null;
  let instagramPosts: FetchedSocialPost[] = [];

  if (instagramAccountId) {
    const ig = await graphGet<IgFields>(`/${instagramAccountId}`, {
      fields: "followers_count,media_count,username",
      access_token: token,
    });
    instagramFollowers = ig.followers_count ?? null;

    const igMedia = await graphGet<{ data?: IgMediaNode[] }>(`/${instagramAccountId}/media`, {
      fields: "id,caption,timestamp,media_type,permalink,like_count,comments_count",
      limit: "25",
      access_token: token,
    });

    instagramPosts = (igMedia.data ?? []).map((media) => ({
      platform: "instagram" as const,
      externalId: media.id,
      postType: (media.media_type ?? "post").toLowerCase(),
      caption: media.caption?.trim() || null,
      permalink: media.permalink ?? null,
      publishedAt: media.timestamp ? new Date(media.timestamp) : null,
      likes: media.like_count ?? 0,
      comments: media.comments_count ?? 0,
      shares: 0,
      reach: null,
    }));
  }

  let reach7d: number | null = null;
  try {
    const since = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
    const insights = await graphGet<InsightsResponse>(`/${pageId}/insights`, {
      metric: "page_impressions_unique",
      period: "day",
      since: String(since),
      access_token: token,
    });
    reach7d =
      insights.data?.[0]?.values?.reduce((sum, row) => sum + (row.value ?? 0), 0) ?? null;
  } catch {
    reach7d = null;
  }

  const allPosts = [...facebookPosts, ...instagramPosts];
  const totalEngagement = allPosts.reduce(
    (sum, post) => sum + post.likes + post.comments + post.shares,
    0
  );
  const followerBase =
    (page.followers_count ?? page.fan_count ?? 0) + (instagramFollowers ?? 0) || 1;
  const engagementRate =
    allPosts.length > 0
      ? Math.round((totalEngagement / allPosts.length / followerBase) * 10000) / 100
      : null;

  return {
    metrics: {
      facebookFollowers: page.followers_count ?? page.fan_count ?? null,
      instagramFollowers,
      reach7d,
      engagementRate,
    },
    posts: [...facebookPosts, ...instagramPosts],
  };
}
