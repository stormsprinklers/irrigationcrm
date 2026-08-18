"use client";

import { format } from "date-fns";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ImageIcon,
  Loader2,
  Megaphone,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MediaLibraryPicker, type MediaLibraryItem } from "@/components/media/MediaLibraryPicker";
import type {
  GbpJobPhotoDto,
  GbpLocalPostDto,
  GbpMediaItemDto,
} from "@/lib/google-business/engagement-types";

type Tab = "posts" | "photos";

export function GoogleBusinessEngagementPanel() {
  const [tab, setTab] = useState<Tab>("posts");
  const [jobPhotos, setJobPhotos] = useState<GbpJobPhotoDto[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);

  const loadJobPhotos = useCallback(async () => {
    setLoadingPhotos(true);
    try {
      const res = await fetch("/api/marketing/google-business/job-photos");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load visit photos");
      setJobPhotos(data.photos ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load visit photos");
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
        <CardTitle className="text-base">Posts & photos</CardTitle>
        <p className="text-sm text-muted-foreground">
          Publish updates and upload job photos to your Google Business Profile. Reply to reviews
          from{" "}
          <Link href="/inbox/reviews" className="underline underline-offset-2">
            Inbox → Google Reviews
          </Link>
          .
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <TabButton active={tab === "posts"} onClick={() => setTab("posts")} icon={Megaphone}>
            Posts
          </TabButton>
          <TabButton active={tab === "photos"} onClick={() => setTab("photos")} icon={ImageIcon}>
            Photos
          </TabButton>
        </div>
      </CardHeader>
      <CardContent>
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
  const [libraryPhoto, setLibraryPhoto] = useState<MediaLibraryItem | null>(null);
  const [mediaOpen, setMediaOpen] = useState(false);
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
      const selectedPhoto = jobPhotos.find((item) => item.id === selectedPhotoId);
      const photoId = libraryPhoto
        ? `media:${libraryPhoto.id}`
        : selectedPhotoId;
      const previewUrl = libraryPhoto?.publicUrl ?? selectedPhoto?.previewUrl;
      const res = await fetch("/api/marketing/google-business/local-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: postText.trim(),
          attachmentId: photoId,
          photoId,
          previewUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to publish post");
      toast.success("Post published to Google");
      setBrief("");
      setPostText("");
      setSelectedPhotoId(null);
      setLibraryPhoto(null);
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
          selectedId={libraryPhoto ? null : selectedPhotoId}
          onSelect={(id) => {
            setLibraryPhoto(null);
            setSelectedPhotoId(id);
          }}
          onReload={onReloadPhotos}
          label="Optional photo from recent visits or social (last 14 days)"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setMediaOpen(true)}>
            Choose from media library
          </Button>
          {libraryPhoto ? (
            <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={libraryPhoto.previewUrl} alt="" className="h-8 w-8 rounded object-cover" />
              {libraryPhoto.fileName}
              <button
                type="button"
                className="underline"
                onClick={() => setLibraryPhoto(null)}
              >
                Clear
              </button>
            </span>
          ) : null}
        </div>
        <Button type="button" disabled={posting} onClick={() => void publishPost()}>
          {posting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          Publish post
        </Button>
      </div>

      <MediaLibraryPicker
        open={mediaOpen}
        onOpenChange={setMediaOpen}
        title="Choose photo for Google post"
        onSelect={(asset) => {
          setLibraryPhoto(asset);
          setSelectedPhotoId(null);
        }}
      />

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
      for (const photoId of selectedIds) {
        const photo = jobPhotos.find((item) => item.id === photoId);
        const res = await fetch("/api/marketing/google-business/media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            photoId,
            previewUrl: photo?.previewUrl,
            category: "AT_WORK",
          }),
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
          label="Recent visit & social photos (last 14 days)"
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
  return "Visit";
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
