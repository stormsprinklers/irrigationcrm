import { GBP_STAR_LABELS } from "@/lib/google-business/engagement-types";
import type { GbpReviewDto } from "@/lib/google-business/engagement-types";
import { requireGbpCompany } from "@/lib/google-business/client";
import { listGbpReviews } from "@/lib/google-business/v4-api";
import { renderGbpReviewCardPng } from "@/lib/slack/gbp-review-image";
import { isSlackConfigured } from "@/lib/slack/config";
import { uploadPngToSlackChannel } from "@/lib/slack/client";
import { prisma } from "@/lib/prisma";

const BOOTSTRAP_MAX_PAGES = 8;

async function bootstrapExistingReviews(
  companyId: string,
  accountId: string,
  locationId: string
) {
  const rows: Array<{ reviewId: string; reviewName: string | null; starRating: number | null }> =
    [];
  let pageToken: string | undefined;

  for (let page = 0; page < BOOTSTRAP_MAX_PAGES; page += 1) {
    const data = await listGbpReviews(companyId, accountId, locationId, pageToken);
    for (const review of data.reviews) {
      rows.push({
        reviewId: review.reviewId,
        reviewName: review.name,
        starRating: GBP_STAR_LABELS[review.starRating] ?? null,
      });
    }
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  if (rows.length > 0) {
    await prisma.gbpReviewSlackDelivery.createMany({
      data: rows.map((row) => ({
        companyId,
        reviewId: row.reviewId,
        reviewName: row.reviewName,
        starRating: row.starRating,
      })),
      skipDuplicates: true,
    });
  }

  await prisma.company.update({
    where: { id: companyId },
    data: { slackGbpReviewsBootstrapped: true },
  });

  return rows.length;
}

async function deliverReviewToSlack(params: {
  companyName: string;
  channelId: string;
  review: GbpReviewDto;
}) {
  const starCount = GBP_STAR_LABELS[params.review.starRating] ?? 0;
  const png = await renderGbpReviewCardPng({
    companyName: params.companyName,
    reviewerName: params.review.reviewerName,
    starCount,
    comment: params.review.comment,
    reviewDate: params.review.createTime ?? params.review.updateTime,
  });

  const starLabel = starCount > 0 ? `${starCount}-star` : "new";
  await uploadPngToSlackChannel({
    channelId: params.channelId,
    buffer: png,
    filename: `google-review-${params.review.reviewId}.png`,
    title: `Google review from ${params.review.reviewerName}`,
    initialComment: `New ${starLabel} Google review from *${params.review.reviewerName}*`,
  });
}

export async function bootstrapGbpReviewSlack(companyId: string) {
  const company = await requireGbpCompany(companyId);
  const count = await bootstrapExistingReviews(
    companyId,
    company.googleBusinessAccountId!,
    company.googleBusinessLocationId!
  );
  return { bootstrapped: count };
}

export async function processGbpReviewSlackNotifications(companyId?: string) {
  if (!isSlackConfigured()) {
    return { companies: 0, posted: 0, skipped: "slack_not_configured" as const };
  }

  const companies = await prisma.company.findMany({
    where: {
      slackGbpReviewsEnabled: true,
      slackGbpReviewsChannelId: { not: null },
      googleBusinessRefreshToken: { not: null },
      ...(companyId ? { id: companyId } : {}),
    },
    select: {
      id: true,
      name: true,
      slackGbpReviewsChannelId: true,
      slackGbpReviewsBootstrapped: true,
      googleBusinessAccountId: true,
      googleBusinessLocationId: true,
    },
  });

  let posted = 0;
  let bootstrapped = 0;
  const errors: string[] = [];

  for (const company of companies) {
    if (
      !company.googleBusinessAccountId ||
      !company.googleBusinessLocationId ||
      !company.slackGbpReviewsChannelId
    ) {
      continue;
    }

    try {
      if (!company.slackGbpReviewsBootstrapped) {
        bootstrapped += await bootstrapExistingReviews(
          company.id,
          company.googleBusinessAccountId,
          company.googleBusinessLocationId
        );
        continue;
      }

      const page = await listGbpReviews(
        company.id,
        company.googleBusinessAccountId,
        company.googleBusinessLocationId
      );

      if (page.reviews.length === 0) continue;

      const delivered = await prisma.gbpReviewSlackDelivery.findMany({
        where: {
          companyId: company.id,
          reviewId: { in: page.reviews.map((review) => review.reviewId) },
        },
        select: { reviewId: true },
      });
      const deliveredSet = new Set(delivered.map((row) => row.reviewId));

      for (const review of page.reviews) {
        if (deliveredSet.has(review.reviewId)) continue;

        await deliverReviewToSlack({
          companyName: company.name,
          channelId: company.slackGbpReviewsChannelId,
          review,
        });

        await prisma.gbpReviewSlackDelivery.create({
          data: {
            companyId: company.id,
            reviewId: review.reviewId,
            reviewName: review.name,
            starRating: GBP_STAR_LABELS[review.starRating] ?? null,
          },
        });

        posted += 1;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "GBP Slack notification failed";
      errors.push(`${company.name}: ${message}`);
      console.error("GBP Slack notification failed:", company.id, err);
    }
  }

  return {
    companies: companies.length,
    posted,
    bootstrapped,
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

  await uploadPngToSlackChannel({
    channelId: company.slackGbpReviewsChannelId,
    buffer: png,
    filename: "google-review-sample.png",
    title: "Sample Google review card",
    initialComment: "Sample Google review notification — your team will see cards like this for new reviews.",
  });
}
