const BLOB_HOST_PATTERN = /\.blob\.vercel-storage\.com$/i;

export function isBlobStorageUrl(url: string) {
  try {
    return BLOB_HOST_PATTERN.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function blobPathnameFromUrl(url: string) {
  try {
    const pathname = new URL(url).pathname.replace(/^\/+/, "");
    return pathname || null;
  } catch {
    return null;
  }
}

export function canAccessBlobPath(companyId: string, pathname: string) {
  const match = pathname.match(/^(employees|visits|estimates|voice-clips|marketing)\/([^/]+)\//);
  return match !== null && match[2] === companyId;
}

/** Serve private blobs through the authenticated app proxy. */
export function blobProxyUrl(storedUrl: string | null | undefined) {
  if (!storedUrl) return undefined;

  const pathname = isBlobStorageUrl(storedUrl)
    ? blobPathnameFromUrl(storedUrl)
    : storedUrl.replace(/^\/+/, "");

  if (!pathname) return undefined;

  return `/api/blob?pathname=${encodeURIComponent(pathname)}`;
}
