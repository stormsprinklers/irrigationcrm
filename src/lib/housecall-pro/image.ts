import { uploadPrivateBlob } from "@/lib/blob/storage";
import { hcpImageUrl } from "@/lib/housecall-pro/expand";
import type { HousecallProClient } from "@/lib/housecall-pro/client";
import type { HcpRecord } from "@/lib/housecall-pro/types";

function extensionForMime(mime: string, sourceUrl: string): string {
  if (/png/i.test(mime) || /\.png(\?|$)/i.test(sourceUrl)) return "png";
  if (/webp/i.test(mime) || /\.webp(\?|$)/i.test(sourceUrl)) return "webp";
  if (/gif/i.test(mime) || /\.gif(\?|$)/i.test(sourceUrl)) return "gif";
  if (/jpeg|jpg/i.test(mime) || /\.jpe?g(\?|$)/i.test(sourceUrl)) return "jpg";
  return "jpg";
}

/** Download an HCP image and store it in private blob storage. Falls back to the source URL. */
export async function importHcpImage(
  client: HousecallProClient,
  record: HcpRecord,
  pathnamePrefix: string
): Promise<{ storedUrl: string | null; sourceUrl: string | null }> {
  const sourceUrl = hcpImageUrl(record);
  if (!sourceUrl) return { storedUrl: null, sourceUrl: null };

  try {
    const { buffer, contentType } = await client.downloadBinary(sourceUrl);
    const ext = extensionForMime(contentType, sourceUrl);
    const blob = await uploadPrivateBlob(
      `${pathnamePrefix}-${Date.now()}.${ext}`,
      buffer,
      { contentType: contentType || `image/${ext}` }
    );
    return { storedUrl: blob.url, sourceUrl };
  } catch {
    return { storedUrl: sourceUrl, sourceUrl };
  }
}
