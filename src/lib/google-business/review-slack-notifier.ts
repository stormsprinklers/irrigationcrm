import { GBP_STAR_LABELS } from "@/lib/google-business/engagement-types";
import type { GbpReviewDto } from "@/lib/google-business/engagement-types";
import { listGbpReviews } from "@/lib/google-business/v4-api";
import { renderGbpReviewCardPng } from "@/lib/slack/gbp-review-image";
import { isSlackConfigured } from "@/lib/slack/config";
import { uploadPngsToSlackChannel } from "@/lib/slack/client";
import { prisma } from "@/lib/prisma";

const REVIEW_FETCH_MAX_PAGES = 10;
const MAX_REVIEWS_PER_MESSAGE = 6;
const MAX_REVIEWS_PER_SEND = 18;
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

function buildBatchComment(companyName: string, reviews: GbpReviewDto[]) {
  if (reviews.length === 1) {
    const review = reviews[0];
    const starCount = GBP_STAR_LABELS[review.starRating] ?? 0;
    const starLabel = starCount > 0 ? `${starCount}-star` : "new";
    return `New ${starLabel} Google review from *${review.reviewerName}* — ${companyName}`;
  }

  const fiveStarCount = reviews.filter((review) => review.starRating === "FIVE").length;
  const summary =
    fiveStarCount > 0
      ? `${reviews.length} Google reviews (${fiveStarCount} five-star)`
      : `${reviews.length} Google reviews`;
  return `*${summary}* for ${companyName}`;
}

async function deliverReviewBatchToSlack(params: {
  companyName: string;
  channelId: string;
  reviews: GbpReviewDto[];
}) {
  const files = await Promise.all(
    params.reviews.map(async (review) => {
      const starCount = GBP_STAR_LABELS[review.starRating] ?? 0;
      const buffer = await renderGbpReviewCardPng({
        companyName: params.companyName,
        reviewerName: review.reviewerName,
        starCount,
        comment: review.comment,
        reviewDate: review.createTime ?? review.updateTime,
      });

      const starLabel = starCount > 0 ? `${starCount}★` : "Review";
      return {
        buffer,
        filename: `google-review-${review.reviewId}.png`,
        title: `${review.reviewerName} — ${starLabel}`,
      };
    })
  );

  await uploadPngsToSlackChannel({
    channelId: params.channelId,
    files,
    initialComment: buildBatchComment(params.companyName, params.reviews),
  });
}

export type SendGbpReviewsToSlackResult = {
  posted: number;
  messages: number;
  remaining: number;
  firstSend: boolean;
  skipped: "slack_not_configured" | "channel_not_configured" | "gbp_not_connected" | null;
  errors: string[];
};

export async function sendUnsentGbpReviewsToSlack(
  companyId: string
): Promise<SendGbpReviewsToSlackResult> {
  if (!isSlackConfigured()) {
    return {
      posted: 0,
      messages: 0,
      remaining: 0,
      firstSend: false,
      skipped: "slack_not_configured",
      errors: [],
    };
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      slackGbpReviewsChannelId: true,
      googleBusinessRefreshToken: true,
      googleBusinessAccountId: true,
      googleBusinessLocationId: true,
    },
  });

  if (!company?.googleBusinessRefreshToken) {
    return {
      posted: 0,
      messages: 0,
      remaining: 0,
      firstSend: false,
      skipped: "gbp_not_connected",
      errors: [],
    };
  }

  if (!company.slackGbpReviewsChannelId) {
    return {
      posted: 0,
      messages: 0,
      remaining: 0,
      firstSend: false,
      skipped: "channel_not_configured",
      errors: [],
    };
  }

  if (!company.googleBusinessAccountId || !company.googleBusinessLocationId) {
    return {
      posted: 0,
      messages: 0,
      remaining: 0,
      firstSend: false,
      skipped: "gbp_not_connected",
      errors: [],
    };
  }

  const deliveredCount = await prisma.gbpReviewSlackDelivery.count({
    where: { companyId },
  });
  const firstSend = deliveredCount === 0;

  const allReviews = await fetchRecentReviews(
    companyId,
    company.googleBusinessAccountId,
    company.googleBusinessLocationId
  );

  const delivered = await prisma.gbpReviewSlackDelivery.findMany({
    where: {
      companyId,
      reviewId: { in: allReviews.map((review) => review.reviewId) },
    },
    select: { reviewId: true },
  });
  const deliveredSet = new Set(delivered.map((row) => row.reviewId));

  let unsent = sortReviewsNewestFirst(
    allReviews.filter((review) => !deliveredSet.has(review.reviewId))
  );

  if (firstSend) {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - FIRST_SEND_LOOKBACK_HOURS);
    unsent = unsent.filter((review) => {
      const iso = review.createTime ?? review.updateTime;
      if (!iso) return false;
      return new Date(iso) >= cutoff;
    });
  }

  const toSend = unsent.slice(0, MAX_REVIEWS_PER_SEND);
  const remaining = Math.max(0, unsent.length - toSend.length);

  if (toSend.length === 0) {
    return {
      posted: 0,
      messages: 0,
      remaining: 0,
      firstSend,
      skipped: null,
      errors: [],
    };
  }

  let posted = 0;
  let messages = 0;
  const errors: string[] = [];

  for (let index = 0; index < toSend.length; index += MAX_REVIEWS_PER_MESSAGE) {
    const batch = toSend.slice(index, index + MAX_REVIEWS_PER_MESSAGE);
    try {
      await deliverReviewBatchToSlack({
        companyName: company.name,
        channelId: company.slackGbpReviewsChannelId,
        reviews: batch,
      });

      await prisma.gbpReviewSlackDelivery.createMany({
        data: batch.map((review) => ({
          companyId: company.id,
          reviewId: review.reviewId,
          reviewName: review.name,
          starRating: GBP_STAR_LABELS[review.starRating] ?? null,
        })),
        skipDuplicates: true,
      });

      posted += batch.length;
      messages += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to post review batch to Slack";
      errors.push(message);
      break;
    }
  }

  return {
    posted,
    messages,
    remaining,
    firstSend,
    skipped: null,
    errors,
  };
}

export async function sendSampleGbpReviewToSlack(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      name: true,
      slackGbpReviewsChannelId: true,
    },
  });

  if (!company?.slackGbpReviewsChannelId) {
    throw new Error("Slack channel is not configured");
  }

  const png = await renderGbpReviewCardPng({
    companyName: company.name,
    reviewerName: "Alex M.",
    starCount: 5,
    comment:
      "Storm Sprinklers showed up fast, explained everything clearly, and left the system running perfectly. Highly recommend!",
    reviewDate: new Date().toISOString(),
  });

  await uploadPngsToSlackChannel({
    channelId: company.slackGbpReviewsChannelId,
    files: [
      {
        buffer: png,
        filename: "google-review-sample.png",
        title: "Sample Google review card",
      },
    ],
    initialComment:
      "Sample Google review notification — your team will see cards like this when you send reviews to Slack.",
  });
}
