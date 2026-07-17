import { AppNotificationType } from "@prisma/client";
import { GBP_STAR_LABELS } from "@/lib/google-business/engagement-types";
import type { GbpReviewDto } from "@/lib/google-business/engagement-types";
import { listGbpReviews } from "@/lib/google-business/v4-api";
import { notifyStaffInApp } from "@/lib/notifications/in-app";
import { prisma } from "@/lib/prisma";

const REVIEW_FETCH_MAX_PAGES = 5;
const MAX_REVIEWS_PER_RUN = 20;
const FIRST_SEND_LOOKBACK_HOURS = 24;

function reviewTimestamp(review: GbpReviewDto) {
  const iso = review.createTime ?? review.updateTime;
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function sortReviewsNewestFirst(reviews: GbpReviewDto[]) {
  return [...reviews].sort((a, b) => reviewTimestamp(b) - reviewTimestamp(a));
}

async function fetchRecentReviews(
  companyId: string,
  accountId: string,
  locationId: string
): Promise<GbpReviewDto[]> {
  const reviews: GbpReviewDto[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < REVIEW_FETCH_MAX_PAGES; page += 1) {
    const data = await listGbpReviews(companyId, accountId, locationId, pageToken);
    reviews.push(...data.reviews);
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return reviews;
}

export type NotifyNewGbpReviewsResult = {
  notified: number;
  skipped: number;
  firstRun: boolean;
  reason?: "gbp_not_connected" | "no_location";
};

/**
 * Poll Google Business Profile for new reviews and fan out Radar in-app + PWA push.
 */
export async function notifyStaffOfNewGbpReviews(
  companyId: string
): Promise<NotifyNewGbpReviewsResult> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      googleBusinessRefreshToken: true,
      googleBusinessAccountId: true,
      googleBusinessLocationId: true,
    },
  });

  if (!company?.googleBusinessRefreshToken) {
    return { notified: 0, skipped: 0, firstRun: false, reason: "gbp_not_connected" };
  }
  if (!company.googleBusinessAccountId || !company.googleBusinessLocationId) {
    return { notified: 0, skipped: 0, firstRun: false, reason: "no_location" };
  }

  const priorCount = await prisma.gbpReviewStaffNotify.count({
    where: { companyId },
  });
  const firstRun = priorCount === 0;

  const allReviews = await fetchRecentReviews(
    companyId,
    company.googleBusinessAccountId,
    company.googleBusinessLocationId
  );

  const already = await prisma.gbpReviewStaffNotify.findMany({
    where: {
      companyId,
      reviewId: { in: allReviews.map((r) => r.reviewId) },
    },
    select: { reviewId: true },
  });
  const alreadySet = new Set(already.map((row) => row.reviewId));

  let pending = sortReviewsNewestFirst(
    allReviews.filter((review) => !alreadySet.has(review.reviewId))
  );

  if (firstRun) {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - FIRST_SEND_LOOKBACK_HOURS);
    pending = pending.filter((review) => {
      const iso = review.createTime ?? review.updateTime;
      if (!iso) return false;
      return new Date(iso) >= cutoff;
    });
  }

  const toNotify = pending.slice(0, MAX_REVIEWS_PER_RUN);
  let notified = 0;

  for (const review of toNotify) {
    const stars = GBP_STAR_LABELS[review.starRating] ?? 0;
    const starLabel = stars > 0 ? `${stars}-star` : "new";
    const commentPreview = review.comment?.trim().slice(0, 120) || null;

    await notifyStaffInApp({
      companyId,
      type: AppNotificationType.GOOGLE_REVIEW,
      title: `New ${starLabel} Google review`,
      body: commentPreview
        ? `${review.reviewerName}: ${commentPreview}`
        : `From ${review.reviewerName}`,
      href: "/marketing/google-business",
    });

    await prisma.gbpReviewStaffNotify.create({
      data: {
        companyId,
        reviewId: review.reviewId,
      },
    });
    notified += 1;
  }

  return {
    notified,
    skipped: Math.max(0, pending.length - toNotify.length),
    firstRun,
  };
}

export async function notifyAllCompaniesOfNewGbpReviews() {
  const companies = await prisma.company.findMany({
    where: {
      googleBusinessRefreshToken: { not: null },
      googleBusinessAccountId: { not: null },
      googleBusinessLocationId: { not: null },
    },
    select: { id: true },
  });

  const results = [];
  for (const company of companies) {
    try {
      results.push({
        companyId: company.id,
        ...(await notifyStaffOfNewGbpReviews(company.id)),
      });
    } catch (error) {
      console.error("GBP review staff notify failed", company.id, error);
      results.push({
        companyId: company.id,
        notified: 0,
        skipped: 0,
        firstRun: false,
        error: error instanceof Error ? error.message : "failed",
      });
    }
  }
  return results;
}
