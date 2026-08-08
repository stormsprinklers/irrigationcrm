"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import type { MediaLibraryItem } from "@/components/media/MediaLibraryPicker";

export default function MediaLibrarySettingsPage() {
  const [assets, setAssets] = useState<MediaLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/media?limit=200");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setAssets(data.assets ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/media", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Upload failed");
        setAssets((prev) => [data.asset as MediaLibraryItem, ...prev]);
      }
      toast.success("Upload complete");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function removeAsset(id: string) {
    try {
      const res = await fetch(`/api/media/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Delete failed");
      }
      setAssets((prev) => prev.filter((a) => a.id !== id));
      toast.success("Deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <ContentArea>
      <PageHeader
        breadcrumb={["Settings", "Communications", "Media library"]}
        title="Media library"
        subtitle="Photos available across email campaigns, Google Business posts, and more."
        actions={
          <label className="inline-flex cursor-pointer">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={(e) => void onUpload(e.target.files)}
            />
            <Button type="button" size="sm" asChild disabled={uploading}>
              <span>
                {uploading ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                )}
                Upload
              </span>
            </Button>
          </label>
        }
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : assets.length === 0 ? (
        <p className="text-sm text-muted-foreground">No media yet. Upload photos to get started.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {assets.map((asset) => (
            <div key={asset.id} className="overflow-hidden rounded-lg border bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={asset.previewUrl}
                alt={asset.alt ?? asset.fileName}
                className="aspect-square w-full object-cover"
              />
              <div className="flex items-start justify-between gap-2 p-2">
                <p className="truncate text-xs text-muted-foreground" title={asset.fileName}>
                  {asset.fileName}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => void removeAsset(asset.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </ContentArea>
  );
}
