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
  const match = pathname.match(
    /^(employees|visits|estimates|customers|voice-clips|marketing|inbox)\/([^/]+)\//
  );
  return match !== null && match[2] === companyId;
}

/** Serve private blobs through the authenticated app proxy; pass through external URLs. */
export function blobProxyUrl(storedUrl: string | null | undefined) {
  if (!storedUrl) return undefined;

  if (!isBlobStorageUrl(storedUrl)) {
    return storedUrl;
  }

  const pathname = blobPathnameFromUrl(storedUrl);
  if (!pathname) return storedUrl;

  return `/api/blob?pathname=${encodeURIComponent(pathname)}`;
}
