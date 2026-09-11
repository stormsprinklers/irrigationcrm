import { getZonedParts } from "@/lib/datetime/zoned";

/** Utah local time for the daily Google review pull. */
export const GBP_REVIEW_PULL_TIMEZONE = "America/Denver";
export const GBP_REVIEW_PULL_HOUR = 16;

/** True at 4:00 PM America/Denver, including MST/MDT. */
export function isGbpReviewPullHour(now = new Date()) {
  return getZonedParts(now, GBP_REVIEW_PULL_TIMEZONE).hour === GBP_REVIEW_PULL_HOUR;
}
