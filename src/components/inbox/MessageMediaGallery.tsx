"use client";

import { Download, FileText } from "lucide-react";
import { blobProxyUrl } from "@/lib/blob/urls";
import {
  isImageMimeType,
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
  if (!media.length) return null;

  return (
    <div className={cn("mt-2 space-y-2", className)}>
      {media.map((item) => {
        const src = mediaSrc(item.blobUrl);
        if (isImageMimeType(item.mimeType)) {
          return (
            <a key={item.id} href={src} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={item.fileName ?? "Image attachment"}
                className="max-h-48 max-w-full rounded-lg object-cover"
              />
            </a>
          );
        }
        if (isVideoMimeType(item.mimeType)) {
          return (
            <video
              key={item.id}
              src={src}
              controls
              className="max-h-48 max-w-full rounded-lg"
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
  );
}
