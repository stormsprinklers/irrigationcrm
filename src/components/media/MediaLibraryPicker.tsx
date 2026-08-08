"use client";

import { useCallback, useEffect, useState } from "react";
import { ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type MediaLibraryItem = {
  id: string;
  fileName: string;
  mimeType: string;
  alt: string | null;
  previewUrl: string;
  publicUrl: string;
  createdAt: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (asset: MediaLibraryItem) => void;
  title?: string;
};

export function MediaLibraryPicker({
  open,
  onOpenChange,
  onSelect,
  title = "Media library",
}: Props) {
  const [assets, setAssets] = useState<MediaLibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/media?limit=100");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load media");
      setAssets(data.assets ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load media");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  if (!open) return null;

  async function onUpload(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/media", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setAssets((prev) => [data.asset as MediaLibraryItem, ...prev]);
      setSelectedId(data.asset.id);
      toast.success("Uploaded to media library");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function removeAsset(id: string) {
    try {
      const res = await fetch(`/api/media/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      setAssets((prev) => prev.filter((a) => a.id !== id));
      if (selectedId === id) setSelectedId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  const selected = assets.find((a) => a.id === selectedId) ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-lg border border-border bg-white p-5 shadow-lg"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">{title}</h2>
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => void onUpload(e.target.files)}
            />
            <Button type="button" variant="outline" size="sm" asChild disabled={uploading}>
              <span>
                {uploading ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                )}
                Upload photo
              </span>
            </Button>
          </label>
          <Button type="button" variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : assets.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
              <ImagePlus className="h-8 w-8 opacity-50" />
              <p>No photos yet. Upload one to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {assets.map((asset) => (
                <div key={asset.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => setSelectedId(asset.id)}
                    className={cn(
                      "aspect-square w-full overflow-hidden rounded-md border bg-muted",
                      selectedId === asset.id && "ring-2 ring-storm-sky"
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={asset.previewUrl}
                      alt={asset.alt ?? asset.fileName}
                      className="h-full w-full object-cover"
                    />
                  </button>
                  <button
                    type="button"
                    className="absolute right-1 top-1 hidden rounded bg-black/60 p-1 text-white group-hover:block"
                    onClick={() => void removeAsset(asset.id)}
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!selected}
            onClick={() => {
              if (!selected) return;
              onSelect(selected);
              onOpenChange(false);
            }}
          >
            Use selected
          </Button>
        </div>
      </div>
    </div>
  );
}
