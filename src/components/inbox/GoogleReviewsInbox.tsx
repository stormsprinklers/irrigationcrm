"use client";

import { format } from "date-fns";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, Search, Sparkles, Star, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { notifyInboxBadgesChanged } from "@/contexts/InboxBadgesProvider";
import type { GbpReviewDto } from "@/lib/google-business/engagement-types";
import { GBP_STAR_LABELS } from "@/lib/google-business/engagement-types";
import { cn } from "@/lib/utils";

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

const UNKNOWN_ASSIGNEE_ID = "__unknown__";
const UNKNOWN_ASSIGNEE_LABEL = "None / Unknown";

type ReviewTechnician = {
  id: string;
  name: string;
  status?: "ACTIVE" | "ARCHIVED" | string;
};

type NeedsAssignmentReview = {
  id: string;
  reviewId: string;
  reviewerName: string;
  comment: string | null;
  starRating: string;
  createTime: string | null;
};

type InboxReviewCard = {
  key: string;
  googleReviewId: string;
  reviewerName: string;
  comment: string | null;
  starRating: string;
  createTime: string | null;
  gbp: GbpReviewDto | null;
  needsReply: boolean;
  needsAssignment: NeedsAssignmentReview | null;
  assigned: Array<{ userId: string; name: string; share: number }>;
};

export function GoogleReviewsInbox() {
  const [googleReviews, setGoogleReviews] = useState<GbpReviewDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [postingId, setPostingId] = useState<string | null>(null);
  const [needsReview, setNeedsReview] = useState<NeedsAssignmentReview[]>([]);
  const [assignmentsByGoogleReviewId, setAssignmentsByGoogleReviewId] = useState<
    Record<string, Array<{ userId: string; name: string; share: number }>>
  >({});
  const [technicians, setTechnicians] = useState<ReviewTechnician[]>([]);

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
      setGoogleReviews(list);
      setReplyDrafts((current) => {
        const next = { ...current };
        for (const review of list) {
          if (!review.reply?.trim() && next[review.name] === undefined) {
            next[review.name] = "";
          }
        }
        return next;
      });
      await loadAssignments();
      notifyInboxBadgesChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load reviews");
      setGoogleReviews([]);
    } finally {
      setLoading(false);
    }
  }, [loadAssignments]);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  const cards = useMemo(() => {
    const needsByGoogleId = new Map(needsReview.map((row) => [row.reviewId, row]));
    const seenGoogleIds = new Set<string>();
    const items: InboxReviewCard[] = [];

    for (const review of googleReviews) {
      const needsReply = !review.reply?.trim();
      const needsAssignment = needsByGoogleId.get(review.reviewId) ?? null;
      if (!needsReply && !needsAssignment) continue;
      seenGoogleIds.add(review.reviewId);
      items.push({
        key: review.name,
        googleReviewId: review.reviewId,
        reviewerName: review.reviewerName,
        comment: review.comment,
        starRating: review.starRating,
        createTime: review.createTime,
        gbp: review,
        needsReply,
        needsAssignment,
        assigned: assignmentsByGoogleReviewId[review.reviewId] ?? [],
      });
    }

    for (const row of needsReview) {
      if (seenGoogleIds.has(row.reviewId)) continue;
      items.push({
        key: `assign-${row.id}`,
        googleReviewId: row.reviewId,
        reviewerName: row.reviewerName,
        comment: row.comment,
        starRating: row.starRating,
        createTime: row.createTime,
        gbp: null,
        needsReply: false,
        needsAssignment: row,
        assigned: [],
      });
    }

    return items.sort((a, b) => {
      const aTime = a.createTime ? new Date(a.createTime).getTime() : 0;
      const bTime = b.createTime ? new Date(b.createTime).getTime() : 0;
      return bTime - aTime;
    });
  }, [assignmentsByGoogleReviewId, googleReviews, needsReview]);

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
          Reply to new Google reviews and assign technician credit when needed — in one list.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading reviews…
        </div>
      ) : cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {googleReviews.length > 0
            ? "You're all caught up — every review has a response and assignment when needed."
            : "No reviews returned from Google for this location yet."}
        </p>
      ) : (
        <div className="space-y-4 pb-8">
          {cards.map((card) => (
            <div key={card.key} className="space-y-3 rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{card.reviewerName}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Stars count={starCount(card.starRating)} />
                    {card.createTime ? (
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(card.createTime), "MMM d, yyyy")}
                      </span>
                    ) : null}
                    {card.needsReply ? (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
                        Needs reply
                      </span>
                    ) : null}
                    {card.needsAssignment ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                        Needs assignment
                      </span>
                    ) : null}
                  </div>
                  {card.assigned.length > 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Assigned:{" "}
                      {card.assigned
                        .map((row) =>
                          row.userId === UNKNOWN_ASSIGNEE_ID
                            ? "None / Unknown"
                            : `${row.name}${row.share ? ` (${row.share.toFixed(2)})` : ""}`
                        )
                        .join(", ")}
                    </p>
                  ) : null}
                </div>
              </div>

              {card.comment ? (
                <p className="whitespace-pre-wrap text-sm text-foreground/90">{card.comment}</p>
              ) : (
                <p className="text-sm italic text-muted-foreground">No written comment</p>
              )}

              {card.gbp?.reply?.trim() ? (
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Posted reply
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{card.gbp.reply}</p>
                </div>
              ) : null}

              {card.needsReply && card.gbp ? (
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Your reply
                  </label>
                  <textarea
                    className="min-h-[96px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                    value={replyDrafts[card.gbp.name] ?? ""}
                    onChange={(e) =>
                      setReplyDrafts((current) => ({
                        ...current,
                        [card.gbp!.name]: e.target.value,
                      }))
                    }
                    placeholder="Write a reply…"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={generatingId === card.gbp.name}
                      onClick={() => void generateReply(card.gbp!)}
                    >
                      {generatingId === card.gbp.name ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="mr-1 h-4 w-4" />
                      )}
                      Generate with AI
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={postingId === card.gbp.name}
                      onClick={() => void postReply(card.gbp!)}
                    >
                      {postingId === card.gbp.name ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : null}
                      Post reply
                    </Button>
                  </div>
                </div>
              ) : null}

              {card.needsAssignment ? (
                <AssignmentPanel
                  review={card.needsAssignment}
                  technicians={technicians}
                  defaultOpen={card.needsReply}
                  onAssigned={() => {
                    notifyInboxBadgesChanged();
                    void loadAssignments();
                  }}
                />
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function technicianLabel(tech: ReviewTechnician) {
  return tech.status === "ARCHIVED" ? `${tech.name} (archived)` : tech.name;
}

function ReviewAssigneeSearch({
  technicians,
  selected,
  onToggle,
}: {
  technicians: ReviewTechnician[];
  selected: string[];
  onToggle: (userId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const selectedTechs = technicians.filter((tech) => selected.includes(tech.id));
  const unknownSelected = selected.includes(UNKNOWN_ASSIGNEE_ID);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const people = technicians.filter((tech) => {
      if (!q) return true;
      return technicianLabel(tech).toLowerCase().includes(q);
    });
    return people;
  }, [query, technicians]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {unknownSelected ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-background px-2 py-0.5 text-xs">
            {UNKNOWN_ASSIGNEE_LABEL}
            <button
              type="button"
              className="rounded-full p-0.5 hover:bg-muted"
              aria-label="Clear None / Unknown"
              onClick={() => onToggle(UNKNOWN_ASSIGNEE_ID)}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ) : null}
        {selectedTechs.map((tech) => (
          <span
            key={tech.id}
            className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-background px-2 py-0.5 text-xs"
          >
            {technicianLabel(tech)}
            <button
              type="button"
              className="rounded-full p-0.5 hover:bg-muted"
              aria-label={`Remove ${tech.name}`}
              onClick={() => onToggle(tech.id)}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>

      <div className="relative" ref={rootRef}>
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search eligible staff…"
          className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        {open ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 cursor-default"
              aria-label="Close technician list"
              onClick={() => setOpen(false)}
            />
            <ul
              className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-md"
              role="listbox"
            >
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={unknownSelected}
                  onClick={() => {
                    onToggle(UNKNOWN_ASSIGNEE_ID);
                    setQuery("");
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full px-3 py-2 text-left text-sm font-medium hover:bg-accent hover:text-accent-foreground",
                    unknownSelected && "bg-highlight-panel"
                  )}
                >
                  {UNKNOWN_ASSIGNEE_LABEL}
                </button>
              </li>
              {results.length === 0 ? (
                <li className="px-3 py-2 text-sm text-muted-foreground">No eligible staff found.</li>
              ) : (
                results.map((tech) => {
                  const checked = selected.includes(tech.id);
                  return (
                    <li key={tech.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={checked}
                        onClick={() => {
                          onToggle(tech.id);
                          setQuery("");
                          setOpen(false);
                        }}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                          checked && "bg-highlight-panel"
                        )}
                      >
                        <span>{tech.name}</span>
                        {tech.status === "ARCHIVED" ? (
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Archived
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </>
        ) : null}
      </div>
    </div>
  );
}

function AssignmentPanel({
  review,
  technicians,
  defaultOpen,
  onAssigned,
}: {
  review: NeedsAssignmentReview;
  technicians: ReviewTechnician[];
  defaultOpen: boolean;
  onAssigned: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen, review.id]);

  async function assign() {
    if (!selected.length) {
      toast.error("Select at least one eligible staff member, or None / Unknown");
      return;
    }
    const unknown = selected.includes(UNKNOWN_ASSIGNEE_ID);
    setSaving(true);
    try {
      const res = await fetch("/api/marketing/google-business/reviews/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          unknown
            ? { reviewId: review.id, unknown: true }
            : { reviewId: review.id, userIds: selected }
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to assign review");
      toast.success(unknown ? "Marked as none / unknown" : "Review assigned");
      onAssigned();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign review");
    } finally {
      setSaving(false);
    }
  }

  function toggleTech(userId: string) {
    setSelected((current) => {
      if (userId === UNKNOWN_ASSIGNEE_ID) {
        return current.includes(UNKNOWN_ASSIGNEE_ID) ? [] : [UNKNOWN_ASSIGNEE_ID];
      }
      const withoutUnknown = current.filter((id) => id !== UNKNOWN_ASSIGNEE_ID);
      return withoutUnknown.includes(userId)
        ? withoutUnknown.filter((id) => id !== userId)
        : [...withoutUnknown, userId];
    });
  }

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/70">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          <span className="block text-sm font-medium text-amber-950">Assign credit</span>
          <span className="block text-xs text-amber-900/80">
            Could not match a team member automatically — search who should get credit, or None / Unknown.
          </span>
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-amber-900/70 transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? (
        <div className="space-y-3 border-t border-amber-200 px-3 py-3">
          <ReviewAssigneeSearch
            technicians={technicians}
            selected={selected}
            onToggle={toggleTech}
          />
          {technicians.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No technicians on file — you can still pick None / Unknown.
            </p>
          ) : null}
          <Button type="button" size="sm" disabled={saving} onClick={() => void assign()}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Assign
          </Button>
        </div>
      ) : null}
    </div>
  );
}
