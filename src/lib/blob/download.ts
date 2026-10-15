import { get } from "@vercel/blob";
import { getBlobToken } from "@/lib/blob/storage";
import { blobPathnameFromUrl, isBlobStorageUrl } from "@/lib/blob/urls";
import { readResponseBufferLimited, safeOutboundFetch } from "@/lib/security/outbound-fetch";

const MAX_EXTERNAL_BLOB_BYTES = 15 * 1024 * 1024;

export async function fetchBlobBytes(blobUrl: string): Promise<{ buffer: Buffer; mimeType: string }> {
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
    return {
      buffer,
      mimeType: result.blob.contentType || "application/octet-stream",
    };
  }

  const res = await safeOutboundFetch(blobUrl);
  if (!res.ok) throw new Error("Failed to read attachment");
  const buffer = await readResponseBufferLimited(res, MAX_EXTERNAL_BLOB_BYTES);
  return {
    buffer,
    mimeType: res.headers.get("content-type") || "application/octet-stream",
  };
}
