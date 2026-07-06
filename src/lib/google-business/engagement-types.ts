export type GbpReviewStarRating = "ONE" | "TWO" | "THREE" | "FOUR" | "FIVE" | "STAR_RATING_UNSPECIFIED";

export type GbpReviewDto = {
  name: string;
  reviewId: string;
  reviewerName: string;
  reviewerPhotoUrl: string | null;
  starRating: GbpReviewStarRating;
  comment: string | null;
  createTime: string | null;
  updateTime: string | null;
  reply: string | null;
  replyUpdateTime: string | null;
};

export type GbpReviewsListResponse = {
  reviews: GbpReviewDto[];
  averageRating: number | null;
  totalReviewCount: number | null;
  nextPageToken: string | null;
};

export type GbpReviewStarBreakdown = {
  stars: number;
  count: number;
  newLast14Days: number;
};

export type GbpReviewSummary = {
  totalReviewCount: number | null;
  averageRating: number | null;
  newReviewsLast7Days: number;
  byStar: GbpReviewStarBreakdown[];
  /** Reviews included when computing star breakdown (all pages fetched up to API limit). */
  reviewsSampled: number;
};

export type GbpLocalPostDto = {
  name: string;
  summary: string;
  createTime: string | null;
  updateTime: string | null;
  state: string | null;
  searchUrl: string | null;
  topicType: string | null;
  mediaUrls: string[];
};

export type GbpMediaItemDto = {
  name: string;
  mediaFormat: string;
  googleUrl: string | null;
  createTime: string | null;
  category: string | null;
};

export type GbpPickablePhotoSource = "visit" | "facebook" | "instagram";

export type GbpJobPhotoDto = {
  id: string;
  source: GbpPickablePhotoSource;
  fileName: string;
  mimeType: string;
  previewUrl: string;
  visitId: string | null;
  visitTitle: string;
  visitStartAt: string | null;
  createdAt: string;
  permalink: string | null;
};

export const GBP_STAR_LABELS: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};
