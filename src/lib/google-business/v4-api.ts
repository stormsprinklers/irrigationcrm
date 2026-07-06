import {
  getCompanyAccessToken,
  googleApiFetch,
  googleApiFetchRaw,
  GoogleBusinessApiError,
} from "@/lib/google-business/client";
import type {
  GbpLocalPostDto,
  GbpMediaItemDto,
  GbpReviewDto,
  GbpReviewSummary,
  GbpReviewsListResponse,
} from "@/lib/google-business/engagement-types";
import { buildGbpLocationParent } from "@/lib/google-business/location-path";

const MYBUSINESS_V4 = "https://mybusiness.googleapis.com/v4";
const MYBUSINESS_UPLOAD = "https://mybusiness.googleapis.com/upload/v1";

function mapReview(raw: Record<string, unknown>): GbpReviewDto {
  const reviewer = raw.reviewer as Record<string, unknown> | undefined;
  const reply = raw.reviewReply as Record<string, unknown> | undefined;
  const name = String(raw.name ?? "");
  const reviewId = String(raw.reviewId ?? name.split("/").pop() ?? "");

  return {
    name,
    reviewId,
    reviewerName: String(reviewer?.displayName ?? "Anonymous"),
    reviewerPhotoUrl: reviewer?.profilePhotoUrl ? String(reviewer.profilePhotoUrl) : null,
    starRating: (raw.starRating as GbpReviewDto["starRating"]) ?? "STAR_RATING_UNSPECIFIED",
    comment: raw.comment ? String(raw.comment) : null,
    createTime: raw.createTime ? String(raw.createTime) : null,
    updateTime: raw.updateTime ? String(raw.updateTime) : null,
    reply: reply?.comment ? String(reply.comment) : null,
    replyUpdateTime: reply?.updateTime ? String(reply.updateTime) : null,
  };
}

function mapLocalPost(raw: Record<string, unknown>): GbpLocalPostDto {
  const media = Array.isArray(raw.media) ? raw.media : [];
  return {
    name: String(raw.name ?? ""),
    summary: String(raw.summary ?? ""),
    createTime: raw.createTime ? String(raw.createTime) : null,
    updateTime: raw.updateTime ? String(raw.updateTime) : null,
    state: raw.state ? String(raw.state) : null,
    searchUrl: raw.searchUrl ? String(raw.searchUrl) : null,
    topicType: raw.topicType ? String(raw.topicType) : null,
    mediaUrls: media
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Record<string, unknown>;
        return row.googleUrl ? String(row.googleUrl) : row.sourceUrl ? String(row.sourceUrl) : null;
      })
      .filter((url): url is string => Boolean(url)),
  };
}

function mapMediaItem(raw: Record<string, unknown>): GbpMediaItemDto {
  const association = raw.locationAssociation as Record<string, unknown> | undefined;
  return {
    name: String(raw.name ?? ""),
    mediaFormat: String(raw.mediaFormat ?? "PHOTO"),
    googleUrl: raw.googleUrl ? String(raw.googleUrl) : null,
    createTime: raw.createTime ? String(raw.createTime) : null,
    category: association?.category ? String(association.category) : null,
  };
}

export async function listGbpReviews(
  companyId: string,
  accountId: string,
  locationId: string,
  pageToken?: string
): Promise<GbpReviewsListResponse> {
  const accessToken = await getCompanyAccessToken(companyId);
  const parent = buildGbpLocationParent(accountId, locationId);
  const params = new URLSearchParams({ pageSize: "50", orderBy: "updateTime desc" });
  if (pageToken) params.set("pageToken", pageToken);

  const data = await googleApiFetch<{
    reviews?: Record<string, unknown>[];
    averageRating?: number;
    totalReviewCount?: number;
    nextPageToken?: string;
  }>(accessToken, `${MYBUSINESS_V4}/${parent}/reviews?${params.toString()}`);

  return {
    reviews: (data.reviews ?? []).map(mapReview),
    averageRating: data.averageRating ?? null,
    totalReviewCount: data.totalReviewCount ?? null,
    nextPageToken: data.nextPageToken ?? null,
  };
}

const REVIEW_SUMMARY_MAX_PAGES = 40;

export async function getGbpReviewSummary(
  companyId: string,
  accountId: string,
  locationId: string
): Promise<GbpReviewSummary> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);

  let totalReviewCount: number | null = null;
  let averageRating: number | null = null;
  let newReviewsLast7Days = 0;
  let pageToken: string | undefined;
  let pages = 0;

  do {
    const page = await listGbpReviews(companyId, accountId, locationId, pageToken);
    if (totalReviewCount === null) {
      totalReviewCount = page.totalReviewCount;
      averageRating = page.averageRating;
    }
    for (const review of page.reviews) {
      if (review.createTime && new Date(review.createTime) >= cutoff) {
        newReviewsLast7Days += 1;
      }
    }
    pageToken = page.nextPageToken ?? undefined;
    pages += 1;
  } while (pageToken && pages < REVIEW_SUMMARY_MAX_PAGES);

  return { totalReviewCount, averageRating, newReviewsLast7Days };
}

export async function updateGbpReviewReply(
  companyId: string,
  reviewName: string,
  comment: string
) {
  const accessToken = await getCompanyAccessToken(companyId);
  return googleApiFetch<{ comment?: string; updateTime?: string }>(
    accessToken,
    `${MYBUSINESS_V4}/${reviewName}/reply`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment }),
    }
  );
}

export async function listGbpLocalPosts(
  companyId: string,
  accountId: string,
  locationId: string
): Promise<GbpLocalPostDto[]> {
  const accessToken = await getCompanyAccessToken(companyId);
  const parent = buildGbpLocationParent(accountId, locationId);

  const data = await googleApiFetch<{ localPosts?: Record<string, unknown>[] }>(
    accessToken,
    `${MYBUSINESS_V4}/${parent}/localPosts`
  );

  return (data.localPosts ?? []).map(mapLocalPost);
}

export async function createGbpLocalPost(
  companyId: string,
  accountId: string,
  locationId: string,
  summary: string,
  photoSourceUrl?: string | null
): Promise<GbpLocalPostDto> {
  const accessToken = await getCompanyAccessToken(companyId);
  const parent = buildGbpLocationParent(accountId, locationId);

  const body: Record<string, unknown> = {
    languageCode: "en-US",
    summary,
    topicType: "STANDARD",
  };

  if (photoSourceUrl) {
    body.media = [{ mediaFormat: "PHOTO", sourceUrl: photoSourceUrl }];
  }

  const data = await googleApiFetch<Record<string, unknown>>(
    accessToken,
    `${MYBUSINESS_V4}/${parent}/localPosts`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  return mapLocalPost(data);
}

export async function listGbpMedia(
  companyId: string,
  accountId: string,
  locationId: string
): Promise<GbpMediaItemDto[]> {
  const accessToken = await getCompanyAccessToken(companyId);
  const parent = buildGbpLocationParent(accountId, locationId);

  const data = await googleApiFetch<{ mediaItems?: Record<string, unknown>[] }>(
    accessToken,
    `${MYBUSINESS_V4}/${parent}/media`
  );

  return (data.mediaItems ?? []).map(mapMediaItem);
}

export async function uploadGbpPhotoBytes(
  companyId: string,
  accountId: string,
  locationId: string,
  bytes: Buffer,
  mimeType: string,
  category: "ADDITIONAL" | "AT_WORK" | "EXTERIOR" | "INTERIOR" | "PRODUCT" | "TEAMS" = "AT_WORK"
): Promise<GbpMediaItemDto> {
  const accessToken = await getCompanyAccessToken(companyId);
  const parent = buildGbpLocationParent(accountId, locationId);

  const start = await googleApiFetch<{ resourceName?: string }>(
    accessToken,
    `${MYBUSINESS_V4}/${parent}/media:startUpload`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }
  );

  const resourceName = start.resourceName;
  if (!resourceName) {
    throw new GoogleBusinessApiError("Google did not return an upload resource name", 500);
  }

  const uploadRes = await googleApiFetchRaw(
    accessToken,
    `${MYBUSINESS_UPLOAD}/media/${encodeURIComponent(resourceName)}?uploadType=media`,
    {
      method: "POST",
      headers: { "Content-Type": mimeType || "application/octet-stream" },
      body: new Uint8Array(bytes),
    }
  );
  await uploadRes.json().catch(() => null);

  const created = await googleApiFetch<Record<string, unknown>>(
    accessToken,
    `${MYBUSINESS_V4}/${parent}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mediaFormat: "PHOTO",
        locationAssociation: { category },
        dataRef: { resourceName },
      }),
    }
  );

  return mapMediaItem(created);
}
