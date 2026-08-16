import { fetchBlobBytes } from "@/lib/blob/download";
import { uploadPrivateBlob } from "@/lib/blob/storage";
import { blobProxyUrl } from "@/lib/blob/urls";

export type StormAiImageInput = {
  /** data:image/...;base64,... or raw base64 */
  dataUrl?: string;
  /** Already-uploaded private blob URL */
  blobUrl?: string;
  mimeType?: string;
  fileName?: string;
};

export type StormAiStoredAttachment = {
  blobUrl: string;
  pathname: string;
  fileName: string;
  mimeType: string;
  kind: "image";
};

const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function parseDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } | null {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) return null;
  const mimeType = match[1]!.toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) return null;
  try {
    const buffer = Buffer.from(match[2]!, "base64");
    if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) return null;
    return { mimeType, buffer };
  } catch {
    return null;
  }
}

export async function storeStormAiImages(params: {
  companyId: string;
  conversationId: string;
  images: StormAiImageInput[];
}): Promise<StormAiStoredAttachment[]> {
  const stored: StormAiStoredAttachment[] = [];
  for (const image of params.images.slice(0, MAX_IMAGES)) {
    if (image.blobUrl && isAllowedStoredBlob(image.blobUrl, params.companyId)) {
      const pathname =
        image.blobUrl.replace(/^https?:\/\/[^/]+\//, "").split("?")[0] || "";
      stored.push({
        blobUrl: image.blobUrl,
        pathname,
        fileName: image.fileName || "photo.jpg",
        mimeType: image.mimeType || "image/jpeg",
        kind: "image",
      });
      continue;
    }
    if (!image.dataUrl) continue;
    const parsed = parseDataUrl(image.dataUrl);
    if (!parsed) continue;
    const ext =
      parsed.mimeType === "image/png"
        ? "png"
        : parsed.mimeType === "image/webp"
          ? "webp"
          : parsed.mimeType === "image/gif"
            ? "gif"
            : "jpg";
    const fileName = (image.fileName || `photo.${ext}`).replace(/[^a-zA-Z0-9._-]/g, "_");
    const blob = await uploadPrivateBlob(
      `storm-ai/${params.companyId}/${params.conversationId}/${Date.now()}-${fileName}`,
      parsed.buffer,
      { contentType: parsed.mimeType }
    );
    const pathname =
      "pathname" in blob && typeof blob.pathname === "string"
        ? blob.pathname
        : blob.url.replace(/^https?:\/\/[^/]+\//, "");
    stored.push({
      blobUrl: blob.url,
      pathname,
      fileName,
      mimeType: parsed.mimeType,
      kind: "image",
    });
  }
  return stored;
}

function isAllowedStoredBlob(url: string, companyId: string) {
  try {
    const pathname = new URL(url).pathname.replace(/^\/+/, "");
    return pathname.startsWith(`storm-ai/${companyId}/`);
  } catch {
    return false;
  }
}

export function serializeAttachments(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const blobUrl = typeof row.blobUrl === "string" ? row.blobUrl : null;
      if (!blobUrl) return null;
      return {
        fileName: typeof row.fileName === "string" ? row.fileName : "photo.jpg",
        mimeType: typeof row.mimeType === "string" ? row.mimeType : "image/jpeg",
        kind: "image" as const,
        url: blobProxyUrl(blobUrl) ?? blobUrl,
      };
    })
    .filter(Boolean) as Array<{
    fileName: string;
    mimeType: string;
    kind: "image";
    url: string;
  }>;
}

/** Build OpenAI image_url data URLs from stored private blobs. */
export async function attachmentsToOpenAiImageParts(
  attachments: StormAiStoredAttachment[]
): Promise<Array<{ type: "image_url"; image_url: { url: string } }>> {
  const parts: Array<{ type: "image_url"; image_url: { url: string } }> = [];
  for (const attachment of attachments) {
    try {
      const { buffer, mimeType } = await fetchBlobBytes(attachment.blobUrl);
      const type = ALLOWED_IMAGE_TYPES.has(mimeType) ? mimeType : attachment.mimeType;
      parts.push({
        type: "image_url",
        image_url: {
          url: `data:${type};base64,${buffer.toString("base64")}`,
        },
      });
    } catch (err) {
      console.error("[storm-ai] failed to load chat image", err);
    }
  }
  return parts;
}

export function parseStoredAttachments(raw: unknown): StormAiStoredAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      if (typeof row.blobUrl !== "string") return null;
      return {
        blobUrl: row.blobUrl,
        pathname: typeof row.pathname === "string" ? row.pathname : "",
        fileName: typeof row.fileName === "string" ? row.fileName : "photo.jpg",
        mimeType: typeof row.mimeType === "string" ? row.mimeType : "image/jpeg",
        kind: "image" as const,
      };
    })
    .filter(Boolean) as StormAiStoredAttachment[];
}
