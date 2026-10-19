"use client";

import { useCallback, useState } from "react";
import { Download, FileText } from "lucide-react";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import { blobProxyUrl } from "@/lib/blob/urls";
import {
  isBrowserImageMimeType,
  isVideoMimeType,
} from "@/lib/inbox/attachments";
import { cn } from "@/lib/utils";

export type MessageMediaItem = {
  id: string;
  blobUrl: string;
  fileName?: string | null;
  mimeType: string;
};

function mediaSrc(url: string) {
  return blobProxyUrl(url) ?? url;
}

export function MessageMediaGallery({
  media,
  className,
}: {
  media: MessageMediaItem[];
  className?: string;
}) {
  const [preview, setPreview] = useState<{ src: string; alt: string } | null>(null);
  const closePreview = useCallback(() => setPreview(null), []);

  if (!media.length) return null;

  return (
    <>
      <div className={cn("mt-2 space-y-2", className)}>
        {media.map((item) => {
          const src = mediaSrc(item.blobUrl);
          if (isBrowserImageMimeType(item.mimeType)) {
            const alt = item.fileName ?? "Image attachment";
            return (
              <button
                key={item.id}
                type="button"
                className="block max-w-full cursor-zoom-in rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Preview ${alt}`}
                onClick={() => setPreview({ src, alt })}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={alt}
                  className="max-h-48 max-w-full rounded-lg object-cover"
                />
              </button>
            );
          }
          if (isVideoMimeType(item.mimeType)) {
            return (
              <video
                key={item.id}
                src={src}
                className="max-h-48 max-w-full rounded-lg"
                controls
                preload="metadata"
              />
            );
          }
          return (
            <a
              key={item.id}
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs underline"
            >
              <FileText className="h-4 w-4" />
              {item.fileName ?? "Download attachment"}
              <Download className="h-3 w-3" />
            </a>
          );
        })}
      </div>
      <ImageLightbox src={preview?.src ?? null} alt={preview?.alt} onClose={closePreview} />
    </>
  );
}
