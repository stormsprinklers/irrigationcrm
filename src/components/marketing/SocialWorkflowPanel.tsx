"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import {
  Calendar,
  Check,
  Copy,
  Facebook,
  Instagram,
  Loader2,
  MessageSquare,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { MarketingSectionCard } from "@/components/marketing/MarketingMetricGrid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  canReviewSocialPosts,
  canSubmitSocialPosts,
} from "@/lib/marketing/social-permissions";

export type SocialSubmission = {
  id: string;
  platform: "facebook" | "instagram";
  postType: string;
  caption: string | null;
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  permalink: string | null;
  publishError: string | null;
  copiedFromId: string | null;
  createdBy: { id: string; name: string; role: string };
  reviewedBy: { id: string; name: string; role: string } | null;
  media: Array<{ id: string; blobUrl: string; fileName: string; mimeType: string }>;
  comments: Array<{
    id: string;
    body: string;
    isRevisionRequest: boolean;
    createdAt: string;
    author: { id: string; name: string };
  }>;
  createdAt: string;
  updatedAt: string;
};

function PlatformIcon({ platform }: { platform: SocialSubmission["platform"] }) {
  return platform === "facebook" ? (
    <Facebook className="h-4 w-4 text-[#1877F2]" />
  ) : (
    <Instagram className="h-4 w-4 text-[#E4405F]" />
  );
}

function statusBadge(status: string) {
  const variants: Record<string, string> = {
    DRAFT: "secondary",
    PENDING_REVIEW: "default",
    REVISION_REQUESTED: "destructive",
    APPROVED: "default",
    SCHEDULED: "default",
    PUBLISHED: "default",
    REJECTED: "destructive",
    FAILED: "destructive",
  };
  const label = status.replace(/_/g, " ").toLowerCase();
  return (
    <Badge variant={(variants[status] as "default" | "secondary" | "destructive") ?? "secondary"}>
      {label}
    </Badge>
  );
}

function PostComposer({
  onCreated,
  onClose,
}: {
  onCreated: () => void;
  onClose: () => void;
}) {
  const [platform, setPlatform] = useState<"facebook" | "instagram">("facebook");
  const [postType, setPostType] = useState("post");
  const [caption, setCaption] = useState("");
  const [media, setMedia] = useState<Array<{ blobUrl: string; fileName: string; mimeType: string }>>(
    []
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch("/api/marketing/assets/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setMedia((prev) => [
        ...prev,
        { blobUrl: data.url, fileName: file.name, mimeType: file.type || "application/octet-stream" },
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function save(submitForReview: boolean) {
    setSaving(true);
    try {
      const res = await fetch("/api/marketing/social/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, postType, caption, media }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create post");

      if (submitForReview) {
        const submitRes = await fetch(`/api/marketing/social/submissions/${data.submission.id}/submit`, {
          method: "POST",
        });
        const submitData = await submitRes.json();
        if (!submitRes.ok) throw new Error(submitData.error ?? "Failed to submit for review");
        toast.success("Submitted for review");
      } else {
        toast.success("Draft saved");
      }
      onCreated();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/10 p-4">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={platform === "facebook" ? "default" : "outline"}
          onClick={() => setPlatform("facebook")}
        >
          <Facebook className="mr-1.5 h-4 w-4" />
          Facebook
        </Button>
        <Button
          type="button"
          size="sm"
          variant={platform === "instagram" ? "default" : "outline"}
          onClick={() => setPlatform("instagram")}
        >
          <Instagram className="mr-1.5 h-4 w-4" />
          Instagram
        </Button>
        <select
          className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          value={postType}
          onChange={(e) => setPostType(e.target.value)}
        >
          <option value="post">Post</option>
          <option value="story">Story</option>
          <option value="reel">Reel</option>
        </select>
      </div>

      <textarea
        className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        placeholder="Caption"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        rows={4}
      />

      <div className="flex flex-wrap gap-2">
        {media.map((item) => (
          <div key={item.blobUrl} className="relative h-20 w-20 overflow-hidden rounded border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.blobUrl} alt={item.fileName} className="h-full w-full object-cover" />
            <button
              type="button"
              className="absolute right-0 top-0 bg-black/60 p-0.5 text-white"
              onClick={() => setMedia((prev) => prev.filter((m) => m.blobUrl !== item.blobUrl))}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded border border-dashed text-muted-foreground hover:bg-muted/30">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          <input
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadFile(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" variant="outline" disabled={saving} onClick={() => void save(false)}>
          Save draft
        </Button>
        <Button type="button" disabled={saving} onClick={() => void save(true)}>
          {saving ? "Saving..." : "Submit for review"}
        </Button>
      </div>
    </div>
  );
}

function SubmissionRow({
  submission,
  canReview,
  canSubmit,
  onChanged,
}: {
  submission: SocialSubmission;
  canReview: boolean;
  canSubmit: boolean;
  onChanged: () => void;
}) {
  const [revisionComment, setRevisionComment] = useState("");
  const [scheduleAt, setScheduleAt] = useState("");
  const [busy, setBusy] = useState(false);
  const latestRevision = [...submission.comments].reverse().find((c) => c.isRevisionRequest);

  async function action(path: string, body?: object) {
    setBusy(true);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      toast.success("Updated");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <PlatformIcon platform={submission.platform} />
            <span className="font-medium capitalize">{submission.platform}</span>
            <span className="text-muted-foreground">· {submission.postType}</span>
            {statusBadge(submission.status)}
          </div>
          <p className="text-sm text-muted-foreground">
            By {submission.createdBy.name}
            {submission.submittedAt
              ? ` · submitted ${format(new Date(submission.submittedAt), "MMM d, h:mm a")}`
              : ""}
          </p>
          <p className="max-w-2xl text-sm">{submission.caption || "(No caption)"}</p>
          {submission.media.length > 0 ? (
            <div className="mt-2 flex gap-2">
              {submission.media.slice(0, 3).map((item) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={item.id}
                  src={item.blobUrl}
                  alt={item.fileName}
                  className="h-14 w-14 rounded object-cover"
                />
              ))}
            </div>
          ) : null}
          {latestRevision ? (
            <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900">
              <MessageSquare className="mr-1 inline h-3.5 w-3.5" />
              Revision requested by {latestRevision.author.name}: {latestRevision.body}
            </p>
          ) : null}
          {submission.publishError ? (
            <p className="mt-2 text-xs text-destructive">{submission.publishError}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          {canReview && submission.status === "PENDING_REVIEW" ? (
            <>
              <Button size="sm" disabled={busy} onClick={() => void action(`/api/marketing/social/submissions/${submission.id}/approve`)}>
                <Check className="mr-1 h-3.5 w-3.5" />
                Approve
              </Button>
              <textarea
                placeholder="Revision request..."
                value={revisionComment}
                onChange={(e) => setRevisionComment(e.target.value)}
                rows={2}
                className="min-w-[200px] rounded-md border border-input bg-background px-2 py-1 text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !revisionComment.trim()}
                onClick={() =>
                  void action(
                    `/api/marketing/social/submissions/${submission.id}/request-revision`,
                    { comment: revisionComment }
                  )
                }
              >
                Request revision
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={() => void action(`/api/marketing/social/submissions/${submission.id}/reject`)}
              >
                Reject
              </Button>
            </>
          ) : null}

          {canSubmit && submission.status === "REVISION_REQUESTED" ? (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void action(`/api/marketing/social/submissions/${submission.id}/submit`)}
            >
              Resubmit for review
            </Button>
          ) : null}

          {canSubmit &&
          (submission.status === "APPROVED" || submission.status === "FAILED") ? (
            <>
              <Input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                className="text-xs"
              />
              <Button
                size="sm"
                disabled={busy || !scheduleAt}
                onClick={() =>
                  void action(`/api/marketing/social/submissions/${submission.id}/schedule`, {
                    scheduledAt: new Date(scheduleAt).toISOString(),
                  })
                }
              >
                <Calendar className="mr-1 h-3.5 w-3.5" />
                Schedule
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void action(`/api/marketing/social/submissions/${submission.id}/schedule`, {
                    scheduledAt: "now",
                  })
                }
              >
                Publish now
              </Button>
            </>
          ) : null}

          {canSubmit &&
          (submission.status === "APPROVED" ||
            submission.status === "SCHEDULED" ||
            submission.status === "DRAFT") ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void action(`/api/marketing/social/submissions/${submission.id}/copy-platform`)
              }
            >
              <Copy className="mr-1 h-3.5 w-3.5" />
              Copy to {submission.platform === "facebook" ? "Instagram" : "Facebook"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function SocialWorkflowPanel({ tab }: { tab: "review" | "scheduled" | "mine" }) {
  const { data: session } = useSession();
  const role = session?.user?.role ?? "";
  const canReview = canReviewSocialPosts(role);
  const canSubmit = canSubmitSocialPosts(role);
  const [submissions, setSubmissions] = useState<SocialSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [showComposer, setShowComposer] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (tab === "review") params.set("status", "PENDING_REVIEW");
    if (tab === "scheduled") params.set("status", "SCHEDULED");
    if (tab === "mine") params.set("mine", "1");

    const res = await fetch(`/api/marketing/social/submissions?${params.toString()}`);
    if (!res.ok) throw new Error("Failed to load submissions");
    const data = await res.json();
    setSubmissions(data.submissions ?? []);
  }, [tab]);

  useEffect(() => {
    load()
      .catch(() => toast.error("Failed to load submissions"))
      .finally(() => setLoading(false));
  }, [load]);

  if (!canReview && !canSubmit) {
    return (
      <p className="text-sm text-muted-foreground">
        Social posting is available to Social Media Managers and admins.
      </p>
    );
  }

  const filtered =
    tab === "mine"
      ? submissions.filter((s) =>
          ["DRAFT", "REVISION_REQUESTED", "APPROVED", "FAILED"].includes(s.status)
        )
      : tab === "review"
        ? submissions
        : submissions;

  return (
    <div className="space-y-4">
      {tab === "review" && canSubmit ? (
        <>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setShowComposer((v) => !v)}>
              <Upload className="mr-1.5 h-4 w-4" />
              {showComposer ? "Close composer" : "New post"}
            </Button>
          </div>
          {showComposer ? (
            <PostComposer
              onCreated={() => {
                void load();
              }}
              onClose={() => setShowComposer(false)}
            />
          ) : null}
        </>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {tab === "review"
            ? "No posts awaiting review."
            : tab === "scheduled"
              ? "No scheduled posts."
              : "No drafts or approved posts in your queue."}
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((submission) => (
            <SubmissionRow
              key={submission.id}
              submission={submission}
              canReview={canReview}
              canSubmit={canSubmit}
              onChanged={() => void load()}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function SocialWorkflowSection({
  title,
  description,
  tab,
}: {
  title: string;
  description: string;
  tab: "review" | "scheduled" | "mine";
}) {
  return (
    <MarketingSectionCard title={title} description={description}>
      <SocialWorkflowPanel tab={tab} />
    </MarketingSectionCard>
  );
}
