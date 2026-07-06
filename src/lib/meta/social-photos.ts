import type { GbpJobPhotoDto } from "@/lib/google-business/engagement-types";
import { resolvePageAccessToken } from "@/lib/meta/token";
import { prisma } from "@/lib/prisma";

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

type GraphError = { message?: string };

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

function sinceDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function isRecent(iso: string | undefined, since: Date) {
  if (!iso) return false;
  const published = new Date(iso);
  return !Number.isNaN(published.getTime()) && published >= since;
}

function captionTitle(caption: string | null | undefined, fallback: string) {
  const text = caption?.trim();
  if (!text) return fallback;
  return text.length > 48 ? `${text.slice(0, 48)}…` : text;
}

function guessMimeType(url: string) {
  const lower = url.toLowerCase();
  if (lower.includes(".png")) return "image/png";
  if (lower.includes(".webp")) return "image/webp";
  if (lower.includes(".gif")) return "image/gif";
  return "image/jpeg";
}

function pushPhoto(
  photos: GbpJobPhotoDto[],
  row: {
    id: string;
    source: "facebook" | "instagram";
    previewUrl: string;
    title: string;
    createdAt: string;
    permalink: string | null;
    fileName: string;
  }
) {
  photos.push({
    id: `${row.source === "facebook" ? "fb" : "ig"}:${row.id}`,
    source: row.source,
    fileName: row.fileName,
    mimeType: guessMimeType(row.previewUrl),
    previewUrl: row.previewUrl,
    visitId: null,
    visitTitle: row.title,
    visitStartAt: null,
    createdAt: row.createdAt,
    permalink: row.permalink,
  });
}

export async function fetchRecentSocialPhotos(
  companyId: string,
  days = 14
): Promise<GbpJobPhotoDto[]> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      metaPageId: true,
      metaInstagramAccountId: true,
      metaPageAccessToken: true,
      metaAppId: true,
      metaAppSecret: true,
    },
  });

  if (!company?.metaPageId || !company.metaPageAccessToken) {
    return [];
  }

  const resolved = await resolvePageAccessToken({
    token: company.metaPageAccessToken,
    pageId: company.metaPageId,
    appId: company.metaAppId ?? process.env.META_APP_ID?.trim() ?? null,
    appSecret: company.metaAppSecret,
  });

  const token = resolved.pageToken;
  const pageId = company.metaPageId;
  const instagramAccountId =
    company.metaInstagramAccountId ?? resolved.instagramAccountId ?? null;
  const since = sinceDate(days);
  const photos: GbpJobPhotoDto[] = [];

  const fbPosts = await graphGet<{
    data?: Array<{
      id?: string;
      message?: string;
      created_time?: string;
      permalink_url?: string;
      full_picture?: string;
      attachments?: {
        data?: Array<{
          media_type?: string;
          media?: { image?: { src?: string } };
        }>;
      };
    }>;
  }>(`/${pageId}/posts`, {
    fields:
      "id,message,created_time,permalink_url,full_picture,attachments{media_type,media{image{src}}}",
    limit: "50",
    access_token: token,
  });

  for (const post of fbPosts.data ?? []) {
    if (!post.id || !isRecent(post.created_time, since)) continue;

    const imageUrl =
      post.full_picture ??
      post.attachments?.data?.find((item) => item.media?.image?.src)?.media?.image?.src;

    if (!imageUrl) continue;

    pushPhoto(photos, {
      id: post.id,
      source: "facebook",
      previewUrl: imageUrl,
      title: captionTitle(post.message, "Facebook post"),
      createdAt: post.created_time!,
      permalink: post.permalink_url ?? null,
      fileName: `facebook-${post.id}.jpg`,
    });
  }

  if (instagramAccountId) {
    const igMedia = await graphGet<{
      data?: Array<{
        id?: string;
        caption?: string;
        timestamp?: string;
        media_type?: string;
        media_url?: string;
        thumbnail_url?: string;
        permalink?: string;
        children?: {
          data?: Array<{
            id?: string;
            media_type?: string;
            media_url?: string;
            thumbnail_url?: string;
          }>;
        };
      }>;
    }>(`/${instagramAccountId}/media`, {
      fields:
        "id,caption,timestamp,media_type,media_url,thumbnail_url,permalink,children{media_type,media_url,thumbnail_url}",
      limit: "50",
      access_token: token,
    });

    for (const media of igMedia.data ?? []) {
      if (!media.id || !isRecent(media.timestamp, since)) continue;

      const children = media.children?.data ?? [];
      if (media.media_type === "CAROUSEL_ALBUM" && children.length > 0) {
        for (const child of children) {
          const imageUrl =
            child.media_type === "VIDEO"
              ? child.thumbnail_url
              : child.media_url ?? child.thumbnail_url;
          if (!imageUrl || !child.id) continue;
          pushPhoto(photos, {
            id: child.id,
            source: "instagram",
            previewUrl: imageUrl,
            title: captionTitle(media.caption, "Instagram"),
            createdAt: media.timestamp!,
            permalink: media.permalink ?? null,
            fileName: `instagram-${child.id}.jpg`,
          });
        }
        continue;
      }

      const imageUrl =
        media.media_type === "VIDEO"
          ? media.thumbnail_url
          : media.media_url ?? media.thumbnail_url;
      if (!imageUrl) continue;

      pushPhoto(photos, {
        id: media.id,
        source: "instagram",
        previewUrl: imageUrl,
        title: captionTitle(media.caption, "Instagram"),
        createdAt: media.timestamp!,
        permalink: media.permalink ?? null,
        fileName: `instagram-${media.id}.jpg`,
      });
    }
  }

  photos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return photos;
}

export function parsePickablePhotoId(photoId: string) {
  if (photoId.startsWith("fb:")) {
    return { source: "facebook" as const, externalId: photoId.slice(3) };
  }
  if (photoId.startsWith("ig:")) {
    return { source: "instagram" as const, externalId: photoId.slice(3) };
  }
  return { source: "visit" as const, externalId: photoId };
}

export async function fetchSocialPhotoBytes(companyId: string, photoId: string) {
  const parsed = parsePickablePhotoId(photoId);
  if (parsed.source === "visit") {
    throw new Error("Not a social photo");
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      metaPageId: true,
      metaPageAccessToken: true,
      metaAppId: true,
      metaAppSecret: true,
    },
  });

  if (!company?.metaPageId || !company.metaPageAccessToken) {
    throw new Error("Meta is not connected");
  }

  const resolved = await resolvePageAccessToken({
    token: company.metaPageAccessToken,
    pageId: company.metaPageId,
    appId: company.metaAppId ?? process.env.META_APP_ID?.trim() ?? null,
    appSecret: company.metaAppSecret,
  });

  const token = resolved.pageToken;
  let imageUrl: string | null = null;

  if (parsed.source === "facebook") {
    const post = await graphGet<{
      full_picture?: string;
      attachments?: { data?: Array<{ media?: { image?: { src?: string } } }> };
    }>(`/${parsed.externalId}`, {
      fields: "full_picture,attachments{media{image{src}}}",
      access_token: token,
    });
    imageUrl =
      post.full_picture ??
      post.attachments?.data?.find((item) => item.media?.image?.src)?.media?.image?.src ??
      null;
  } else {
    const media = await graphGet<{
      media_type?: string;
      media_url?: string;
      thumbnail_url?: string;
      children?: { data?: Array<{ id?: string; media_url?: string; thumbnail_url?: string }> };
    }>(`/${parsed.externalId}`, {
      fields: "media_type,media_url,thumbnail_url,children{media_url,thumbnail_url}",
      access_token: token,
    });
    imageUrl = media.media_url ?? media.thumbnail_url ?? null;
    if (!imageUrl) {
      const child = media.children?.data?.find((row) => row.id === parsed.externalId);
      imageUrl = child?.media_url ?? child?.thumbnail_url ?? null;
    }
  }

  if (!imageUrl) {
    throw new Error("Could not resolve image URL from Meta");
  }

  const res = await fetch(imageUrl, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to download image (${res.status})`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() || guessMimeType(imageUrl);

  return { buffer, mimeType };
}
