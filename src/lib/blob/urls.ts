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
    /^(employees|visits|estimates|customers|voice-clips|marketing|inbox|vehicles|company-email)\/([^/]+)\//
  );
  if (match) return match[2] === companyId;

  const gbpMatch = pathname.match(/^gbp\/local-posts\/([^/]+)\//);
  return gbpMatch !== null && gbpMatch[1] === companyId;
}

/** Paths safe to expose without auth (email logos, Google-fetchable marketing media). */
export function canPublicAccessBlobPath(pathname: string) {
  return /^(company-email|gbp\/local-posts)\/[^/]+\//.test(pathname);
}

function appOrigin() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
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

/**
 * Absolute URL that email clients / Google can fetch without a CRM session.
 * Non-blob URLs are returned unchanged.
 */
export function absolutePublicBlobUrl(storedUrl: string | null | undefined) {
  if (!storedUrl?.trim()) return undefined;

  if (!isBlobStorageUrl(storedUrl)) {
    return storedUrl.trim();
  }

  const pathname = blobPathnameFromUrl(storedUrl);
  if (!pathname || !canPublicAccessBlobPath(pathname)) {
    return storedUrl.trim();
  }

  const origin = appOrigin();
  const path = `/api/public/blob?pathname=${encodeURIComponent(pathname)}`;
  return origin ? `${origin}${path}` : path;
}
