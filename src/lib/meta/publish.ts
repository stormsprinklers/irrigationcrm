const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

type PublishResult = {
  externalPostId: string;
  permalink: string | null;
};

async function graphPost(path: string, params: Record<string, string>) {
  const body = new URLSearchParams(params);
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const data = (await res.json()) as { id?: string; post_id?: string; error?: { message?: string } };
  if (!res.ok || data.error) {
    throw new Error(data.error?.message ?? `Meta publish failed (${res.status})`);
  }
  return data;
}

export async function publishFacebookSubmission(params: {
  pageId: string;
  pageAccessToken: string;
  caption: string | null;
  mediaUrls: string[];
  scheduledAt?: Date | null;
}) {
  const { pageId, pageAccessToken, caption, mediaUrls, scheduledAt } = params;
  const message = caption?.trim() ?? "";
  const token = pageAccessToken;
  const scheduleUnix =
    scheduledAt && scheduledAt.getTime() > Date.now()
      ? String(Math.floor(scheduledAt.getTime() / 1000))
      : null;

  if (mediaUrls.length === 0) {
    const payload: Record<string, string> = {
      message,
      access_token: token,
    };
    if (scheduleUnix) {
      payload.published = "false";
      payload.scheduled_publish_time = scheduleUnix;
    }
    const result = await graphPost(`/${pageId}/feed`, payload);
    return {
      externalPostId: result.id ?? result.post_id ?? "",
      permalink: result.id ? `https://www.facebook.com/${result.id}` : null,
    } satisfies PublishResult;
  }

  const photo = mediaUrls[0];
  const payload: Record<string, string> = {
    url: photo,
    caption: message,
    access_token: token,
  };
  if (scheduleUnix) {
    payload.published = "false";
    payload.scheduled_publish_time = scheduleUnix;
  }
  const result = await graphPost(`/${pageId}/photos`, payload);
  return {
    externalPostId: result.id ?? result.post_id ?? "",
    permalink: result.post_id ? `https://www.facebook.com/${result.post_id}` : null,
  } satisfies PublishResult;
}

export async function publishInstagramSubmission(params: {
  instagramAccountId: string;
  pageAccessToken: string;
  caption: string | null;
  mediaUrls: string[];
}) {
  const { instagramAccountId, pageAccessToken, caption, mediaUrls } = params;
  const imageUrl = mediaUrls[0];
  if (!imageUrl) {
    throw new Error("Instagram posts require at least one image.");
  }

  const container = await graphPost(`/${instagramAccountId}/media`, {
    image_url: imageUrl,
    caption: caption?.trim() ?? "",
    access_token: pageAccessToken,
  });

  const creationId = container.id;
  if (!creationId) {
    throw new Error("Instagram media container was not created.");
  }

  const published = await graphPost(`/${instagramAccountId}/media_publish`, {
    creation_id: creationId,
    access_token: pageAccessToken,
  });

  const mediaId = published.id ?? creationId;
  return {
    externalPostId: mediaId,
    permalink: `https://www.instagram.com/p/${mediaId}/`,
  } satisfies PublishResult;
}

export async function publishSocialSubmission(params: {
  platform: string;
  pageId: string;
  instagramAccountId: string | null;
  pageAccessToken: string;
  caption: string | null;
  mediaUrls: string[];
  scheduledAt?: Date | null;
}) {
  if (params.platform === "instagram") {
    if (!params.instagramAccountId) {
      throw new Error("Instagram account ID is not configured.");
    }
    return publishInstagramSubmission({
      instagramAccountId: params.instagramAccountId,
      pageAccessToken: params.pageAccessToken,
      caption: params.caption,
      mediaUrls: params.mediaUrls,
    });
  }

  return publishFacebookSubmission({
    pageId: params.pageId,
    pageAccessToken: params.pageAccessToken,
    caption: params.caption,
    mediaUrls: params.mediaUrls,
    scheduledAt: params.scheduledAt,
  });
}
