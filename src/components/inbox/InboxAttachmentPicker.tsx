"use client";

import { useRef, useState } from "react";
import { ImagePlus, Link2, Loader2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PendingAttachment } from "@/lib/inbox/attachments";
import { isImageMimeType, isVideoMimeType } from "@/lib/inbox/attachments";
import { cn } from "@/lib/utils";

const SMS_BROWSER_UPLOAD_TARGET_BYTES = 3.5 * 1024 * 1024;
const SMS_BROWSER_IMAGE_MAX_DIMENSION = 2560;

function inferredImageMimeType(file: File) {
  if (file.type) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase();
  const mimeByExtension: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    heic: "image/heic",
    heif: "image/heif",
  };
  return extension ? mimeByExtension[extension] ?? "" : "";
}

async function prepareBrowserSmsPhoto(file: File) {
  const mimeType = inferredImageMimeType(file);
  const typedFile =
    mimeType && mimeType !== file.type
      ? new File([file], file.name, { type: mimeType, lastModified: file.lastModified })
      : file;

  if (
    typedFile.size <= SMS_BROWSER_UPLOAD_TARGET_BYTES ||
    !["image/jpeg", "image/png", "image/webp"].includes(mimeType.toLowerCase()) ||
    typeof createImageBitmap !== "function"
  ) {
    return typedFile;
  }

  try {
    const bitmap = await createImageBitmap(typedFile);
    const scale = Math.min(
      1,
      SMS_BROWSER_IMAGE_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height)
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return typedFile;
    }
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    let compressed: Blob | null = null;
    for (const quality of [0.88, 0.78, 0.68, 0.58]) {
      compressed = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality)
      );
      if (compressed && compressed.size <= SMS_BROWSER_UPLOAD_TARGET_BYTES) break;
    }
    if (!compressed || compressed.size >= typedFile.size) return typedFile;

    const jpegName = typedFile.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([compressed], jpegName, {
      type: "image/jpeg",
      lastModified: typedFile.lastModified,
    });
  } catch {
    return typedFile;
  }
}

async function uploadErrorMessage(response: Response, fileName: string) {
  const fallback = `Failed to upload ${fileName}`;
  const raw = await response.text().catch(() => "");
  if (!raw) return response.status === 413 ? "Photo is too large to upload" : fallback;
  try {
    const parsed = JSON.parse(raw) as { error?: string };
    return parsed.error ?? fallback;
  } catch {
    return response.status === 413 ? "Photo is too large to upload" : fallback;
  }
}

export function InboxAttachmentPicker({
  channel,
  attachments,
  onChange,
  maxCount = channel === "sms" ? 10 : 10,
  className,
}: {
  channel: "sms" | "email";
  attachments: PendingAttachment[];
  onChange: (attachments: PendingAttachment[]) => void;
  maxCount?: number;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkText, setLinkText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    if (attachments.length >= maxCount) {
      toast.error(`Maximum ${maxCount} attachments`);
      return;
    }

    setUploading(true);
    try {
      const next = [...attachments];
      for (const file of Array.from(files)) {
        if (next.length >= maxCount) break;

        const uploadFile = channel === "sms" ? await prepareBrowserSmsPhoto(file) : file;
        const formData = new FormData();
        formData.set("file", uploadFile);
        try {
          const res = await fetch(`/api/inbox/media/upload?channel=${channel}`, {
            method: "POST",
            body: formData,
          });
          if (!res.ok) {
            toast.error(await uploadErrorMessage(res, file.name));
            continue;
          }
          const data = (await res.json()) as PendingAttachment;
          next.push({
            blobUrl: data.blobUrl,
            publicUrl: data.publicUrl,
            fileName: data.fileName,
            mimeType: data.mimeType,
            sizeBytes: data.sizeBytes,
          });
        } catch (error) {
          console.error("Inbox attachment upload failed", error);
          toast.error(`Failed to upload ${file.name}. Please try again.`);
        }
      }
      onChange(next);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function removeAt(index: number) {
    onChange(attachments.filter((_, i) => i !== index));
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple={channel === "email"}
          accept={
            channel === "sms"
              ? "image/*,video/mp4,video/quicktime,video/3gpp,video/mpeg"
              : "image/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx"
          }
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading || attachments.length >= maxCount}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : channel === "sms" ? (
            <ImagePlus className="mr-1 h-4 w-4" />
          ) : (
            <Paperclip className="mr-1 h-4 w-4" />
          )}
          {channel === "sms" ? "Photo / video" : "Attach file"}
        </Button>
        {channel === "email" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLinkOpen((v) => !v)}
          >
            <Link2 className="mr-1 h-4 w-4" />
            Insert link
          </Button>
        )}
      </div>

      {channel === "email" && linkOpen && (
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed p-3">
          <div className="min-w-[120px] flex-1">
            <label className="mb-1 block text-xs text-muted-foreground">Link text</label>
            <Input
              value={linkText}
              onChange={(e) => setLinkText(e.target.value)}
              placeholder="View details"
            />
          </div>
          <div className="min-w-[160px] flex-[2]">
            <label className="mb-1 block text-xs text-muted-foreground">URL</label>
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              if (!linkUrl.trim()) {
                toast.error("Enter a URL");
                return;
              }
              const text = linkText.trim() || linkUrl.trim();
              onChange([
                ...attachments,
                {
                  blobUrl: "",
                  fileName: `link:${text}`,
                  mimeType: "text/uri-list",
                  sizeBytes: 0,
                  publicUrl: linkUrl.trim(),
                },
              ]);
              setLinkText("");
              setLinkUrl("");
              setLinkOpen(false);
            }}
          >
            Add
          </Button>
        </div>
      )}

      {attachments.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {attachments.map((file, index) => (
            <li
              key={`${file.blobUrl}-${index}`}
              className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs"
            >
              {file.mimeType === "text/uri-list" ? (
                <span className="max-w-[180px] truncate">Link: {file.fileName.replace(/^link:/, "")}</span>
              ) : isImageMimeType(file.mimeType) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={file.publicUrl ?? file.blobUrl}
                  alt=""
                  className="h-8 w-8 rounded object-cover"
                />
              ) : (
                <span className="max-w-[180px] truncate">{file.fileName}</span>
              )}
              {!file.mimeType.startsWith("text/uri") && (
                <span className="text-muted-foreground">
                  {isVideoMimeType(file.mimeType) ? "Video" : ""}
                </span>
              )}
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => removeAt(index)}
                aria-label="Remove attachment"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
