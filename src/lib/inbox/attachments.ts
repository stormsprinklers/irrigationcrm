import { get } from "@vercel/blob";
import { getBlobToken } from "@/lib/blob/storage";
import { blobPathnameFromUrl, isBlobStorageUrl } from "@/lib/blob/urls";

export const SMS_MEDIA_MAX_BYTES = 5 * 1024 * 1024;
export const EMAIL_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const EMAIL_ATTACHMENT_MAX_TOTAL_BYTES = 25 * 1024 * 1024;
export const EMAIL_ATTACHMENT_MAX_COUNT = 10;
export const SMS_MEDIA_MAX_COUNT = 10;

export const SMS_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
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

function startsWith(bytes: Uint8Array, expected: number[]) {
  return expected.every((value, index) => bytes[index] === value);
}

/** Verify common attachment formats from bytes instead of trusting client MIME metadata. */
export async function hasExpectedFileSignature(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 512).arrayBuffer());
  const mime = file.type.toLowerCase();

  if (mime === "image/jpeg") return startsWith(bytes, [0xff, 0xd8, 0xff]);
  if (mime === "image/png") return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mime === "image/gif") {
    const header = new TextDecoder().decode(bytes.slice(0, 6));
    return header === "GIF87a" || header === "GIF89a";
  }
  if (mime === "image/webp") {
    return new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
      new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  }
  if (["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"].includes(mime)) {
    if (new TextDecoder().decode(bytes.slice(4, 8)) !== "ftyp") return false;
    const brand = new TextDecoder().decode(bytes.slice(8, 12)).toLowerCase();
    return ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(brand);
  }
  if (mime === "application/pdf") {
    return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  }
  if (mime === "video/mp4" || mime === "video/quicktime" || mime === "video/3gpp") {
    return new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp";
  }
  if (mime === "video/mpeg") {
    return startsWith(bytes, [0x00, 0x00, 0x01, 0xba]) || startsWith(bytes, [0x00, 0x00, 0x01, 0xb3]);
  }
  if (mime === "application/msword" || mime === "application/vnd.ms-excel") {
    return startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  }
  if (mime.includes("openxmlformats-officedocument")) {
    return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
  }
  if (mime === "text/plain" || mime === "text/csv") {
    return !bytes.includes(0);
  }
  return false;
}

export function isImageMimeType(mimeType: string) {
  return mimeType.startsWith("image/");
}

/** Image formats that current browsers can render directly without conversion. */
export function isBrowserImageMimeType(mimeType: string) {
  return ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"].includes(
    mimeType.toLowerCase().split(";", 1)[0].trim()
  );
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

export async function fetchBlobAsBase64(blobUrl: string, companyId: string) {
  const pathname = blobPathnameFromUrl(blobUrl);
  if (
    !isBlobStorageUrl(blobUrl) ||
    !pathname?.startsWith(`inbox/${companyId}/email/outbound/`)
  ) {
    throw new Error("Invalid email attachment URL");
  }

  const token = getBlobToken();
  if (!token) throw new Error("Blob storage not configured");

  const result = await get(pathname, { access: "private", token });
  if (!result || result.statusCode !== 200) {
    throw new Error("Failed to read attachment");
  }

  const buffer = Buffer.from(await new Response(result.stream).arrayBuffer());
  return buffer.toString("base64");
}

export function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_") || "file";
}
