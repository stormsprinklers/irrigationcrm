import { differenceInCalendarDays } from "date-fns";

export type PostCadenceTone = "normal" | "warning" | "overdue";

export function getPostCadence(lastPostAt: string | Date | null | undefined, now = new Date()) {
  if (!lastPostAt) {
    return { daysSinceLastPost: null, tone: "overdue" as const };
  }

  const lastPostDate = lastPostAt instanceof Date ? lastPostAt : new Date(lastPostAt);
  if (Number.isNaN(lastPostDate.getTime())) {
    return { daysSinceLastPost: null, tone: "overdue" as const };
  }

  const daysSinceLastPost = Math.max(0, differenceInCalendarDays(now, lastPostDate));
  const tone: PostCadenceTone = daysSinceLastPost > 7
    ? "overdue"
    : daysSinceLastPost > 4
      ? "warning"
      : "normal";

  return { daysSinceLastPost, tone };
}
