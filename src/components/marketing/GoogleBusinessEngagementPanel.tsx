"use client";

import { format } from "date-fns";
import { useCallback, useEffect, useState } from "react";
import {
  ImageIcon,
  Loader2,
  MessageSquare,
  Megaphone,
  Sparkles,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  GbpJobPhotoDto,
  GbpLocalPostDto,
  GbpMediaItemDto,
  GbpReviewDto,
} from "@/lib/google-business/engagement-types";
import { GBP_STAR_LABELS } from "@/lib/google-business/engagement-types";

type Tab = "reviews" | "posts" | "photos";

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

export function GoogleBusinessEngagementPanel() {
  const [tab, setTab] = useState<Tab>("reviews");
  const [jobPhotos, setJobPhotos] = useState<GbpJobPhotoDto[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);

  const loadJobPhotos = useCallback(async () => {
    setLoadingPhotos(true);
    try {
      const res = await fetch("/api/marketing/google-business/job-photos");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load job photos");
      setJobPhotos(data.photos ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load job photos");
      setJobPhotos([]);
    } finally {
      setLoadingPhotos(false);
    }
  }, []);

  useEffect(() => {
    void loadJobPhotos();
  }, [loadJobPhotos]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Reviews, posts & photos</CardTitle>
        <p className="text-sm text-muted-foreground">
          Respond to reviews, publish updates, and upload job photos to your Google Business
          Profile. AI drafts text for you to edit before posting.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <TabButton active={tab === "reviews"} onClick={() => setTab("reviews")} icon={MessageSquare}>
            Reviews
          </TabButton>
          <TabButton active={tab === "posts"} onClick={() => setTab("posts")} icon={Megaphone}>
            Posts
          </TabButton>
          <TabButton active={tab === "photos"} onClick={() => setTab("photos")} icon={ImageIcon}>
            Photos
          </TabButton>
        </div>
      </CardHeader>
      <CardContent>
        {tab === "reviews" ? <ReviewsTab /> : null}
        {tab === "posts" ? (
          <PostsTab jobPhotos={jobPhotos} loadingPhotos={loadingPhotos} onReloadPhotos={loadJobPhotos} />
        ) : null}
        {tab === "photos" ? (
          <PhotosTab jobPhotos={jobPhotos} loadingPhotos={loadingPhotos} onReloadPhotos={loadJobPhotos} />
        ) : null}
      </CardContent>
    </Card>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Button type="button" size="sm" variant={active ? "default" : "outline"} onClick={onClick}>
      <Icon className="mr-1 h-4 w-4" />
      {children}
    </Button>
  );
}

function ReviewsTab() {
  const [reviews, setReviews] = useState<GbpReviewDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [postingId, setPostingId] = useState<string | null>(null);

  const loadReviews = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/marketing/google-business/reviews");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load reviews");
      const list = (data.reviews ?? []) as GbpReviewDto[];
      setReviews(list);
      setReplyDrafts((current) => {
        const next = { ...current };
        for (const review of list) {
          if (next[review.name] === undefined) {
            next[review.name] = review.reply ?? "";
          }
        }
        return next;
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load reviews");
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, []);

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
        body: JSON.stringify({ reviewName: review.name, comment }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to post reply");
      toast.success("Reply posted to Google");
      await loadReviews();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to post reply");
    } finally {
      setPostingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading reviews…
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No reviews returned from Google for this location yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {reviews.map((review) => (
        <div key={review.name} className="rounded-lg border p-4 space-y-3">
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
            </div>
            {review.reply ? <Badge variant="secondary">Replied</Badge> : null}
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
      ))}
    </div>
  );
}

function PostsTab({
  jobPhotos,
  loadingPhotos,
  onReloadPhotos,
}: {
  jobPhotos: GbpJobPhotoDto[];
  loadingPhotos: boolean;
  onReloadPhotos: () => Promise<void>;
}) {
  const [posts, setPosts] = useState<GbpLocalPostDto[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [brief, setBrief] = useState("");
  const [postText, setPostText] = useState("");
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [posting, setPosting] = useState(false);

  const loadPosts = useCallback(async () => {
    setLoadingPosts(true);
    try {
      const res = await fetch("/api/marketing/google-business/local-posts");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load posts");
      setPosts(data.posts ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load posts");
      setPosts([]);
    } finally {
      setLoadingPosts(false);
    }
  }, []);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  async function generatePost() {
    if (!brief.trim()) {
      toast.error("Add a quick description of what you want the post to cover");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/marketing/google-business/generate-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate post");
      setPostText(data.text);
      toast.success("Post draft ready — edit before publishing");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate post");
    } finally {
      setGenerating(false);
    }
  }

  async function publishPost() {
    if (!postText.trim()) {
      toast.error("Write post text first");
      return;
    }
    setPosting(true);
    try {
      const res = await fetch("/api/marketing/google-business/local-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: postText.trim(),
          attachmentId: selectedPhotoId,
          photoId: selectedPhotoId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to publish post");
      toast.success("Post published to Google");
      setBrief("");
      setPostText("");
      setSelectedPhotoId(null);
      await loadPosts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to publish post");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-lg border p-4">
        <p className="text-sm font-medium">Create a post</p>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            What should this post be about?
          </label>
          <input
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="e.g. Spring startup special, winterization tips, new team member"
          />
        </div>
        <Button type="button" size="sm" variant="outline" disabled={generating} onClick={() => void generatePost()}>
          {generating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
          Generate post with AI
        </Button>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Post text (editable)</label>
          <textarea
            className="min-h-[140px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            value={postText}
            onChange={(e) => setPostText(e.target.value)}
            placeholder="AI draft or your own copy…"
          />
        </div>
        <JobPhotoPicker
          photos={jobPhotos}
          loading={loadingPhotos}
          selectedId={selectedPhotoId}
          onSelect={setSelectedPhotoId}
          onReload={onReloadPhotos}
          label="Optional photo from recent jobs or social (last 14 days)"
        />
        <Button type="button" disabled={posting} onClick={() => void publishPost()}>
          {posting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          Publish post
        </Button>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">Recent posts</p>
        {loadingPosts ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading posts…
          </div>
        ) : posts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No posts on this location yet.</p>
        ) : (
          posts.map((post) => (
            <div key={post.name} className="rounded-lg border p-3 space-y-2">
              {post.createTime ? (
                <p className="text-xs text-muted-foreground">
                  {format(new Date(post.createTime), "MMM d, yyyy h:mm a")}
                  {post.state ? ` · ${post.state.replace(/_/g, " ")}` : ""}
                </p>
              ) : null}
              <p className="text-sm whitespace-pre-wrap">{post.summary}</p>
              {post.mediaUrls.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {post.mediaUrls.map((url) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={url} src={url} alt="" className="h-20 w-20 rounded object-cover" />
                  ))}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function PhotosTab({
  jobPhotos,
  loadingPhotos,
  onReloadPhotos,
}: {
  jobPhotos: GbpJobPhotoDto[];
  loadingPhotos: boolean;
  onReloadPhotos: () => Promise<void>;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [media, setMedia] = useState<GbpMediaItemDto[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(true);

  const loadMedia = useCallback(async () => {
    setLoadingMedia(true);
    try {
      const res = await fetch("/api/marketing/google-business/media");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load profile photos");
      setMedia(data.media ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load profile photos");
      setMedia([]);
    } finally {
      setLoadingMedia(false);
    }
  }, []);

  useEffect(() => {
    void loadMedia();
  }, [loadMedia]);

  function togglePhoto(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    );
  }

  async function uploadSelected() {
    if (selectedIds.length === 0) {
      toast.error("Select at least one photo");
      return;
    }
    setUploading(true);
    try {
      let uploaded = 0;
      for (const attachmentId of selectedIds) {
        const res = await fetch("/api/marketing/google-business/media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photoId: attachmentId, category: "AT_WORK" }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Upload failed");
        uploaded += 1;
      }
      toast.success(`Uploaded ${uploaded} photo${uploaded === 1 ? "" : "s"} to Google`);
      setSelectedIds([]);
      await loadMedia();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload photos");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <JobPhotoPicker
          photos={jobPhotos}
          loading={loadingPhotos}
          selectedId={null}
          selectedIds={selectedIds}
          multi
          onSelect={(id) => togglePhoto(id)}
          onReload={onReloadPhotos}
          label="Recent job & social photos (last 14 days)"
        />
        <Button type="button" disabled={uploading || selectedIds.length === 0} onClick={() => void uploadSelected()}>
          {uploading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          Upload selected to profile
        </Button>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">Photos on your Google profile</p>
        {loadingMedia ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : media.length === 0 ? (
          <p className="text-sm text-muted-foreground">No photos loaded from Google yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {media
              .filter((item) => item.googleUrl)
              .map((item) => (
                <div key={item.name} className="space-y-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.googleUrl!} alt="" className="aspect-square w-full rounded-lg object-cover border" />
                  {item.category ? (
                    <p className="text-xs text-muted-foreground">{item.category.replace(/_/g, " ")}</p>
                  ) : null}
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function sourceLabel(source: GbpJobPhotoDto["source"]) {
  if (source === "facebook") return "Facebook";
  if (source === "instagram") return "Instagram";
  return "Job visit";
}

function JobPhotoPicker({
  photos,
  loading,
  selectedId,
  selectedIds,
  multi = false,
  onSelect,
  onReload,
  label,
}: {
  photos: GbpJobPhotoDto[];
  loading: boolean;
  selectedId?: string | null;
  selectedIds?: string[];
  multi?: boolean;
  onSelect: (id: string) => void;
  onReload: () => Promise<void>;
  label: string;
}) {
  const isSelected = (id: string) =>
    multi ? (selectedIds ?? []).includes(id) : selectedId === id;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void onReload()}>
          Refresh
        </Button>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading gallery…
        </div>
      ) : photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No photos from the last 14 days. Add visit photos in the mobile app, or connect Meta in
          Settings to include Facebook and Instagram posts.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 max-h-64 overflow-y-auto rounded-md border p-2">
          {photos.map((photo) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => onSelect(photo.id)}
              className={`overflow-hidden rounded-md border text-left transition ${
                isSelected(photo.id) ? "ring-2 ring-primary border-primary" : "hover:border-primary/50"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.previewUrl} alt={photo.fileName} className="aspect-square w-full object-cover" />
              <div className="p-1.5">
                <div className="flex items-center justify-between gap-1">
                  <p className="truncate text-xs font-medium">{photo.visitTitle}</p>
                  <Badge variant="outline" className="shrink-0 px-1 py-0 text-[9px]">
                    {sourceLabel(photo.source)}
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {format(new Date(photo.createdAt), "MMM d")}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
