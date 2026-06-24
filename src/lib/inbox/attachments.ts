import { get } from "@vercel/blob";
import { getBlobToken } from "@/lib/blob/storage";
import { blobPathnameFromUrl, isBlobStorageUrl } from "@/lib/blob/urls";

export const SMS_MEDIA_MAX_BYTES = 5 * 1024 * 1024;
export const EMAIL_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const EMAIL_ATTACHMENT_MAX_TOTAL_BYTES = 25 * 1024 * 1024;
export const SMS_MEDIA_MAX_COUNT = 10;

export const SMS_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/3gpp",
  "video/mpeg",
] as const;

export const EMAIL_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export type PendingAttachment = {
  blobUrl: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  publicUrl?: string;
};

export function isAllowedSmsMimeType(mimeType: string) {
  return (SMS_ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
}

export function isAllowedEmailMimeType(mimeType: string) {
  return (EMAIL_ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
}

export function isImageMimeType(mimeType: string) {
  return mimeType.startsWith("image/");
}

export function isVideoMimeType(mimeType: string) {
  return mimeType.startsWith("video/");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain text → HTML with auto-linked URLs and line breaks. */
export function plainTextToEmailHtml(text: string) {
  const escaped = escapeHtml(text);
  const linked = escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" style="color:#2563eb;text-decoration:underline">$1</a>'
  );
  return linked.replace(/\n/g, "<br/>");
}

export function stripHtmlToText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Minimal sanitization for displaying inbound HTML. */
export function sanitizeEmailHtml(html: string) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}

export async function fetchBlobAsBase64(blobUrl: string) {
  if (isBlobStorageUrl(blobUrl)) {
    const pathname = blobPathnameFromUrl(blobUrl);
    if (!pathname) throw new Error("Invalid blob URL");

    const token = getBlobToken();
    if (!token) throw new Error("Blob storage not configured");

    const result = await get(pathname, { access: "private", token });
    if (!result || result.statusCode !== 200) {
      throw new Error("Failed to read attachment");
    }

    const buffer = Buffer.from(await new Response(result.stream).arrayBuffer());
    return buffer.toString("base64");
  }

  const res = await fetch(blobUrl);
  if (!res.ok) throw new Error("Failed to read attachment");
  const buffer = Buffer.from(await res.arrayBuffer());
  return buffer.toString("base64");
}

export function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_") || "file";
}
