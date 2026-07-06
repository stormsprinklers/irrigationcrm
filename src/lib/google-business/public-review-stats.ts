import { listGbpReviews } from "@/lib/google-business/v4-api";

export type WebsiteReviewStats = {
  ratingValue: number;
  reviewCount: number;
  reviewCountLabel: string;
};

export function formatWebsiteReviewStats(
  averageRating: number | null,
  totalReviewCount: number | null
): WebsiteReviewStats | null {
  if (averageRating == null || totalReviewCount == null) return null;

  const reviewCount = Math.max(0, Math.round(totalReviewCount));
  const ratingValue = Math.round(averageRating * 10) / 10;
  const reviewCountLabel = reviewCount.toLocaleString("en-US");

  return { ratingValue, reviewCount, reviewCountLabel };
}

export async function getGbpPublicReviewStats(
  companyId: string,
  accountId: string,
  locationId: string
): Promise<WebsiteReviewStats | null> {
  const page = await listGbpReviews(companyId, accountId, locationId);
  return formatWebsiteReviewStats(page.averageRating, page.totalReviewCount);
}
