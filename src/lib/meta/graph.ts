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
    period?: string;
    values?: Array<{ value?: number }>;
  }>;
};

async function graphGetSafe<T>(path: string, params: Record<string, string>) {
  try {
    return { ok: true as const, data: await graphGet<T>(path, params) };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Meta Graph API error",
    };
  }
}

function totalInsightValue(insights: InsightsResponse): number | null {
  const values = insights.data?.[0]?.values;
  if (!values?.length) return null;

  if (values.length === 1) {
    return values[0].value ?? null;
  }

  return values.reduce((sum, row) => sum + (row.value ?? 0), 0);
}

/** Facebook Page reach for the last 7 days via Meta Page Insights API. */
async function fetchPageReach7d(pageId: string, token: string): Promise<number | null> {
  const attempts: Array<Record<string, string>> = [
    {
      metric: "page_impressions_unique",
      period: "day",
      date_preset: "last_7d",
    },
    {
      metric: "page_total_media_view_unique",
      period: "day",
      date_preset: "last_7d",
    },
    {
      metric: "page_impressions_unique",
      period: "week",
    },
    {
      metric: "page_posts_impressions_unique",
      period: "day",
      date_preset: "last_7d",
    },
  ];

  for (const params of attempts) {
    const result = await graphGetSafe<InsightsResponse>(`/${pageId}/insights`, {
      ...params,
      access_token: token,
    });

    if (!result.ok) continue;

    const total = totalInsightValue(result.data);
    if (total != null) return total;
  }

  return null;
}

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

  const reach7d = await fetchPageReach7d(pageId, token);

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
