"use client";

import { format } from "date-fns";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Sparkles, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { notifyInboxBadgesChanged } from "@/contexts/InboxBadgesProvider";
import type { GbpReviewDto } from "@/lib/google-business/engagement-types";
import { GBP_STAR_LABELS } from "@/lib/google-business/engagement-types";

function starCount(rating: string) {
  return GBP_STAR_LABELS[rating] ?? 0;
}

function Stars({ count }: { count: number }) {
  return (
    <span className="inline-flex gap-0.5 text-amber-500">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`h-3.5 w-3.5 ${n <= count ? "fill-current" : "opacity-25"}`} />
      ))}
    </span>
  );
}

type NeedsAssignmentReview = {
  id: string;
  reviewId: string;
  reviewerName: string;
  comment: string | null;
  starRating: string;
  createTime: string | null;
};

export function GoogleReviewsInbox() {
  const [reviews, setReviews] = useState<GbpReviewDto[]>([]);
  const [allReviewsResponded, setAllReviewsResponded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [postingId, setPostingId] = useState<string | null>(null);
  const [needsReview, setNeedsReview] = useState<NeedsAssignmentReview[]>([]);
  const [assignmentsByGoogleReviewId, setAssignmentsByGoogleReviewId] = useState<
    Record<string, Array<{ userId: string; name: string; share: number }>>
  >({});
  const [technicians, setTechnicians] = useState<Array<{ id: string; name: string }>>([]);

  const loadAssignments = useCallback(async () => {
    const res = await fetch("/api/marketing/google-business/reviews/assignments");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load review assignments");
    setNeedsReview(data.needsReview ?? []);
    setAssignmentsByGoogleReviewId(data.assignmentsByGoogleReviewId ?? {});
    setTechnicians(data.technicians ?? []);
  }, []);

  const loadReviews = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/marketing/google-business/reviews");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load reviews");
      const list = (data.reviews ?? []) as GbpReviewDto[];
      const unreplied = list.filter((review) => !review.reply?.trim());
      setReviews(unreplied);
      setAllReviewsResponded(list.length > 0 && unreplied.length === 0);
      setReplyDrafts((current) => {
        const next = { ...current };
        for (const review of unreplied) {
          if (next[review.name] === undefined) {
            next[review.name] = "";
          }
        }
        return next;
      });
      await loadAssignments();
      notifyInboxBadgesChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load reviews");
      setReviews([]);
      setAllReviewsResponded(false);
    } finally {
      setLoading(false);
    }
  }, [loadAssignments]);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  async function generateReply(review: GbpReviewDto) {
    setGeneratingId(review.name);
    try {
      const res = await fetch("/api/marketing/google-business/generate-review-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewerName: review.reviewerName,
          starRating: review.starRating,
          reviewComment: review.comment,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate reply");
      setReplyDrafts((current) => ({ ...current, [review.name]: data.text }));
      toast.success("Reply draft ready — edit before posting");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate reply");
    } finally {
      setGeneratingId(null);
    }
  }

  async function postReply(review: GbpReviewDto) {
    const comment = replyDrafts[review.name]?.trim();
    if (!comment) {
      toast.error("Write a reply first");
      return;
    }
    setPostingId(review.name);
    try {
      const res = await fetch("/api/marketing/google-business/reviews/reply", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewName: review.name,
          reviewId: review.reviewId,
          comment,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to post reply");
      toast.success("Reply posted to Google");
      notifyInboxBadgesChanged();
      await loadReviews();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to post reply");
    } finally {
      setPostingId(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto px-4 py-3">
      <div className="mb-4">
        <p className="text-xs text-muted-foreground">Inbox &gt; Google Reviews</p>
        <h1 className="mt-1 font-display text-xl font-bold">Google Reviews</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Reply to new Google reviews and assign credit when a technician could not be matched
          automatically.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading reviews…
        </div>
      ) : (
        <div className="space-y-6 pb-8">
          <NeedsAssignmentList
            reviews={needsReview}
            technicians={technicians}
            onAssigned={() => {
              notifyInboxBadgesChanged();
              void loadAssignments();
            }}
          />

          {reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {allReviewsResponded
                ? "You're all caught up — every review has a response."
                : "No reviews returned from Google for this location yet."}
            </p>
          ) : (
            <div className="space-y-4">
              {reviews.map((review) => {
                const assigned = assignmentsByGoogleReviewId[review.reviewId] ?? [];
                return (
                  <div key={review.name} className="rounded-lg border bg-card p-4 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{review.reviewerName}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <Stars count={starCount(review.starRating)} />
                          {review.createTime ? (
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(review.createTime), "MMM d, yyyy")}
                            </span>
                          ) : null}
                        </div>
                        {assigned.length > 0 ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Assigned:{" "}
                            {assigned
                              .map((row) => `${row.name} (${row.share.toFixed(2)})`)
                              .join(", ")}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    {review.comment ? (
                      <p className="text-sm text-foreground/90 whitespace-pre-wrap">{review.comment}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No written comment</p>
                    )}
                    <div className="space-y-2">
                      <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Your reply
                      </label>
                      <textarea
                        className="min-h-[96px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                        value={replyDrafts[review.name] ?? ""}
                        onChange={(e) =>
                          setReplyDrafts((current) => ({ ...current, [review.name]: e.target.value }))
                        }
                        placeholder="Write a reply…"
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={generatingId === review.name}
                          onClick={() => void generateReply(review)}
                        >
                          {generatingId === review.name ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          ) : (
                            <Sparkles className="mr-1 h-4 w-4" />
                          )}
                          Generate with AI
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={postingId === review.name}
                          onClick={() => void postReply(review)}
                        >
                          {postingId === review.name ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          ) : null}
                          Post reply
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NeedsAssignmentList({
  reviews,
  technicians,
  onAssigned,
}: {
  reviews: NeedsAssignmentReview[];
  technicians: Array<{ id: string; name: string }>;
  onAssigned: () => void;
}) {
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  if (reviews.length === 0) return null;

  async function assign(reviewId: string) {
    const userIds = selected[reviewId] ?? [];
    if (!userIds.length) {
      toast.error("Select at least one technician");
      return;
    }
    setSavingId(reviewId);
    try {
      const res = await fetch("/api/marketing/google-business/reviews/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId, userIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to assign review");
      toast.success("Review assigned");
      onAssigned();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign review");
    } finally {
      setSavingId(null);
    }
  }

  function toggleTech(reviewId: string, userId: string) {
    setSelected((current) => {
      const list = current[reviewId] ?? [];
      return {
        ...current,
        [reviewId]: list.includes(userId) ? list.filter((id) => id !== userId) : [...list, userId],
      };
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div>
        <p className="font-medium text-amber-950">Needs assignment</p>
        <p className="text-sm text-amber-900/80">
          These Google reviews could not be matched to a customer or technician. Assign credit
          manually.
        </p>
      </div>
      {reviews.map((review) => (
        <div key={review.id} className="rounded-md border border-amber-200 bg-white p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">{review.reviewerName}</p>
            {review.createTime ? (
              <span className="text-xs text-muted-foreground">
                {format(new Date(review.createTime), "MMM d, yyyy")}
              </span>
            ) : null}
          </div>
          <Stars count={starCount(review.starRating)} />
          {review.comment ? (
            <p className="text-sm whitespace-pre-wrap">{review.comment}</p>
          ) : (
            <p className="text-sm italic text-muted-foreground">No written comment</p>
          )}
          <div className="flex flex-wrap gap-2">
            {technicians.map((tech) => {
              const checked = (selected[review.id] ?? []).includes(tech.id);
              return (
                <label
                  key={tech.id}
                  className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleTech(review.id, tech.id)}
                  />
                  {tech.name}
                </label>
              );
            })}
          </div>
          <Button
            type="button"
            size="sm"
            disabled={savingId === review.id}
            onClick={() => void assign(review.id)}
          >
            {savingId === review.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Assign
          </Button>
        </div>
      ))}
    </div>
  );
}
