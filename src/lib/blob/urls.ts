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
    /^(employees|visits|estimates|customers|voice-clips|marketing|inbox|vehicles|company-email|company-brand|company-bimi|company-holiday|portal-offers|media|price-book|parts-info|storm-ai)\/([^/]+)\//
  );
  if (match) return match[2] === companyId;

  const gbpMatch = pathname.match(/^gbp\/local-posts\/([^/]+)\//);
  return gbpMatch !== null && gbpMatch[1] === companyId;
}

/** Paths safe to expose without auth (email logos, marketing media, portal offers, present photos). */
export function canPublicAccessBlobPath(pathname: string) {
  return /^(company-email|company-brand|company-bimi|company-holiday|gbp\/local-posts|portal-offers|employees|media|price-book)\/[^/]+\//.test(
    pathname
  );
}

/** Customer-facing estimate option photo URL (Present mode, portal, mobile). */
export function estimateOptionPhotoUrl(storedUrl: string | null | undefined) {
  if (!storedUrl?.trim()) return null;
  return absolutePublicBlobUrl(storedUrl) ?? storedUrl.trim();
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

/** Absolute CRM URL for a private blob proxy path (or pass-through https). */
export function absoluteBlobProxyUrl(storedUrl: string | null | undefined) {
  const proxied = blobProxyUrl(storedUrl);
  if (!proxied) return undefined;
  if (/^https?:\/\//i.test(proxied)) return proxied;
  const origin = appOrigin();
  if (!origin) return proxied;
  return `${origin}${proxied.startsWith("/") ? proxied : `/${proxied}`}`;
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
