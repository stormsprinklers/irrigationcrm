import { Prisma } from "@prisma/client";
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
import { GBP_STAR_LABELS } from "@/lib/google-business/engagement-types";
import { buildGbpLocationParent } from "@/lib/google-business/location-path";
import type { GbpCatalogCache } from "@/lib/google-business/types";
import { prisma } from "@/lib/prisma";

const MYBUSINESS_V4 = "https://mybusiness.googleapis.com/v4";
const MYBUSINESS_UPLOAD = "https://mybusiness.googleapis.com/upload/v1";

function gbpMediaUploadUrl(resourceName: string) {
  const normalized = resourceName.startsWith("media/") ? resourceName : `media/${resourceName}`;
  return `${MYBUSINESS_UPLOAD}/${normalized}?uploadType=media`;
}

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

async function fetchGbpReviewsPage(
  accessToken: string,
  accountId: string,
  locationId: string,
  pageToken?: string
): Promise<GbpReviewsListResponse> {
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

export async function listGbpReviews(
  companyId: string,
  accountId: string,
  locationId: string,
  pageToken?: string
): Promise<GbpReviewsListResponse> {
  const accessToken = await getCompanyAccessToken(companyId);
  return fetchGbpReviewsPage(accessToken, accountId, locationId, pageToken);
}

const REVIEW_SUMMARY_MAX_PAGES = 40;

function starLevelFromRating(rating: GbpReviewDto["starRating"]) {
  return GBP_STAR_LABELS[rating] ?? null;
}

function emptyStarBreakdown() {
  return [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: 0,
    newLast7Days: 0,
  }));
}

export async function getGbpReviewSummary(
  companyId: string,
  accountId: string,
  locationId: string
): Promise<GbpReviewSummary> {
  const cutoff7 = new Date();
  cutoff7.setDate(cutoff7.getDate() - 7);

  let totalReviewCount: number | null = null;
  let averageRating: number | null = null;
  let newReviewsLast7Days = 0;
  let reviewsSampled = 0;
  const countByStar = new Map<number, number>([
    [5, 0],
    [4, 0],
    [3, 0],
    [2, 0],
    [1, 0],
  ]);
  const recentByStar = new Map<number, number>([
    [5, 0],
    [4, 0],
    [3, 0],
    [2, 0],
    [1, 0],
  ]);

  let pageToken: string | undefined;
  let pages = 0;

  const accessToken = await getCompanyAccessToken(companyId);

  do {
    const page = await fetchGbpReviewsPage(accessToken, accountId, locationId, pageToken);
    if (totalReviewCount === null) {
      totalReviewCount = page.totalReviewCount;
      averageRating = page.averageRating;
    }

    for (const review of page.reviews) {
      reviewsSampled += 1;
      const stars = starLevelFromRating(review.starRating);
      if (stars) {
        countByStar.set(stars, (countByStar.get(stars) ?? 0) + 1);
        if (review.createTime && new Date(review.createTime) >= cutoff7) {
          recentByStar.set(stars, (recentByStar.get(stars) ?? 0) + 1);
        }
      }
      if (review.createTime && new Date(review.createTime) >= cutoff7) {
        newReviewsLast7Days += 1;
      }
    }

    pageToken = page.nextPageToken ?? undefined;
    pages += 1;
  } while (pageToken && pages < REVIEW_SUMMARY_MAX_PAGES);

  const byStar = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: countByStar.get(stars) ?? 0,
    newLast7Days: recentByStar.get(stars) ?? 0,
  }));

  return {
    totalReviewCount,
    averageRating,
    newReviewsLast7Days,
    byStar: byStar.length ? byStar : emptyStarBreakdown(),
    reviewsSampled,
  };
}

const REVIEW_SUMMARY_TTL_MS = 15 * 60 * 1000;

function readCatalog(raw: unknown): GbpCatalogCache {
  if (!raw || typeof raw !== "object") return {};
  return raw as GbpCatalogCache;
}

/**
 * Returns the GBP review summary for a location, backed by a short-lived DB cache
 * stored on Company.googleBusinessCatalogJson. Fresh cache is returned immediately;
 * otherwise the live summary is fetched and persisted. On a transient live-fetch
 * failure the last known good cached value is returned so callers never regress to a
 * stale/lower fallback once a real Google value has been recorded.
 */
export async function getCachedGbpReviewSummary(
  companyId: string,
  accountId: string,
  locationId: string,
  options: { refresh?: boolean; maxAgeMs?: number } = {}
): Promise<GbpReviewSummary> {
  const maxAgeMs = options.maxAgeMs ?? REVIEW_SUMMARY_TTL_MS;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { googleBusinessCatalogJson: true },
  });
  const catalog = readCatalog(company?.googleBusinessCatalogJson);
  const cached = catalog.reviewSummaryByLocation?.[locationId];
  const fetchedAtIso = catalog.reviewSummaryFetchedAt?.[locationId];
  const fresh =
    !!fetchedAtIso && Date.now() - new Date(fetchedAtIso).getTime() < maxAgeMs;

  if (!options.refresh && cached && fresh) {
    return cached;
  }

  try {
    const summary = await getGbpReviewSummary(companyId, accountId, locationId);
    const next: GbpCatalogCache = {
      ...catalog,
      reviewSummaryByLocation: {
        ...(catalog.reviewSummaryByLocation ?? {}),
        [locationId]: summary,
      },
      reviewSummaryFetchedAt: {
        ...(catalog.reviewSummaryFetchedAt ?? {}),
        [locationId]: new Date().toISOString(),
      },
    };
    await prisma.company.update({
      where: { id: companyId },
      data: { googleBusinessCatalogJson: next as Prisma.InputJsonValue },
    });
    return summary;
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
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
  category: "ADDITIONAL" | "AT_WORK" | "EXTERIOR" | "INTERIOR" | "PRODUCT" | "TEAMS" = "ADDITIONAL"
): Promise<GbpMediaItemDto> {
  const accessToken = await getCompanyAccessToken(companyId);
  const parent = buildGbpLocationParent(accountId, locationId);
  const normalizedMime = mimeType.split(";")[0].trim().toLowerCase();
  const uploadMime =
    normalizedMime === "image/jpg" ? "image/jpeg" : normalizedMime || "image/jpeg";

  if (!uploadMime.startsWith("image/")) {
    throw new GoogleBusinessApiError(
      "Google Business Profile photos must be an image file",
      400
    );
  }
  if (bytes.length === 0) {
    throw new GoogleBusinessApiError("Photo file was empty", 400);
  }
  if (bytes.length > 10 * 1024 * 1024) {
    throw new GoogleBusinessApiError("Google photos must be 10 MB or smaller", 400);
  }

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
    gbpMediaUploadUrl(resourceName),
    {
      method: "POST",
      headers: { "Content-Type": uploadMime },
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
