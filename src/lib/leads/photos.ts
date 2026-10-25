import { blobPathnameFromUrl, isBlobStorageUrl } from "@/lib/blob/urls";

export type StoredLeadPhoto = {
  name: string;
  url: string;
  pathname: string;
  mimeType: string;
};

const SAFE_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Return only private lead photos that belong to the requested company/lead.
 * Integration metadata is untrusted, so callers must not expose arbitrary URLs.
 */
export function storedLeadPhotos(
  metadata: unknown,
  scope: { companyId: string; leadId: string }
): StoredLeadPhoto[] {
  const meta = asRecord(metadata);
  const rawPhotos = meta && Array.isArray(meta.photos) ? meta.photos : [];
  const expectedPrefix = `leads/${scope.companyId}/${scope.leadId}/`;

  return rawPhotos.flatMap((value, index) => {
    const photo = asRecord(value);
    const url = typeof photo?.url === "string" ? photo.url.trim() : "";
    if (!url || !isBlobStorageUrl(url)) return [];

    const pathnameFromMetadata =
      typeof photo?.pathname === "string" ? photo.pathname.replace(/^\/+/, "") : null;
    const pathname = pathnameFromMetadata || blobPathnameFromUrl(url);
    if (!pathname?.startsWith(expectedPrefix)) return [];

    const rawName = typeof photo?.name === "string" ? photo.name.trim() : "";
    const rawMimeType =
      typeof photo?.mimeType === "string" ? photo.mimeType.trim().toLowerCase() : "";

    return [
      {
        name: rawName || `quote-photo-${index + 1}.jpg`,
        url,
        pathname,
        // The estimate wizard always rasterizes uploads to JPEG. Older rows did
        // not persist the MIME type, so JPEG is the correct legacy fallback.
        mimeType: SAFE_IMAGE_MIME_TYPES.has(rawMimeType) ? rawMimeType : "image/jpeg",
      },
    ];
  });
}
