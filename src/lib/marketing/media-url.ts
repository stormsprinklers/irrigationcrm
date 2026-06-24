import { getAppBaseUrl } from "@/lib/app-url";
import { pathnameFromBlobUrl, signMediaPath } from "@/lib/inbox/media-url";
import { isBlobStorageUrl } from "@/lib/blob/urls";

/** Meta-accessible URL for a private marketing blob (Facebook/Instagram fetch this server-side). */
export function metaAccessibleMediaUrl(pathname: string, ttlSeconds = 7200) {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = signMediaPath(pathname, expires);
  const base = getAppBaseUrl();
  return `${base}/api/meta/media?pathname=${encodeURIComponent(pathname)}&expires=${expires}&sig=${sig}`;
}

export function resolveMediaUrlForMeta(storedUrl: string) {
  if (!isBlobStorageUrl(storedUrl)) return storedUrl;
  const pathname = pathnameFromBlobUrl(storedUrl);
  if (!pathname) return storedUrl;
  return metaAccessibleMediaUrl(pathname);
}
