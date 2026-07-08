const DEFAULT_MAX_URLS = 400;
const FETCH_TIMEOUT_MS = 12_000;

export type SitemapPagesSnapshot = {
  sourceUrl: string;
  pageUrls: string[];
  totalCount: number;
  truncated: boolean;
};

function normalizeWebsiteBase(url: string): string {
  let base = url.trim();
  if (!base) return "";
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  return base.replace(/\/$/, "");
}

function extractLocUrls(xml: string): string[] {
  const urls: string[] = [];
  const pattern = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    const value = match[1]?.trim();
    if (value) urls.push(value);
  }
  return urls;
}

function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex[\s>]/i.test(xml);
}

async function fetchXml(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/xml,text/xml,*/*",
        "User-Agent": "StormCRM-SEO-Bot/1.0",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text.trim() || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch and parse the live sitemap XML for a website so SEO AI knows which pages exist.
 * Uses Search Console sitemap paths when provided, otherwise `{website}/sitemap.xml`.
 */
export async function fetchSitemapPages(params: {
  websiteUrl: string | null;
  sitemapPaths?: string[];
  maxUrls?: number;
}): Promise<SitemapPagesSnapshot | null> {
  const base = params.websiteUrl ? normalizeWebsiteBase(params.websiteUrl) : "";
  if (!base) return null;

  const candidates = [
    ...(params.sitemapPaths ?? []).map((path) => path.trim()).filter(Boolean),
    `${base}/sitemap.xml`,
  ];
  const seenSources = new Set<string>();
  const uniqueSources: string[] = [];
  for (const candidate of candidates) {
    const normalized = candidate.startsWith("http") ? candidate : `${base}/${candidate.replace(/^\//, "")}`;
    if (!seenSources.has(normalized)) {
      seenSources.add(normalized);
      uniqueSources.push(normalized);
    }
  }

  const maxUrls = params.maxUrls ?? DEFAULT_MAX_URLS;
  const collected = new Set<string>();
  let sourceUrl = uniqueSources[0] ?? `${base}/sitemap.xml`;

  async function collectFromSitemap(sitemapUrl: string, depth: number): Promise<void> {
    if (collected.size >= maxUrls || depth > 3) return;

    const xml = await fetchXml(sitemapUrl);
    if (!xml) return;

    if (!sourceUrl) sourceUrl = sitemapUrl;

    const locs = extractLocUrls(xml);
    if (!locs.length) return;

    if (isSitemapIndex(xml)) {
      for (const child of locs) {
        if (collected.size >= maxUrls) break;
        await collectFromSitemap(child, depth + 1);
      }
      return;
    }

    for (const url of locs) {
      if (collected.size >= maxUrls) break;
      collected.add(url);
    }
  }

  for (const sitemapUrl of uniqueSources) {
    if (collected.size >= maxUrls) break;
    await collectFromSitemap(sitemapUrl, 0);
    if (collected.size > 0) {
      sourceUrl = sitemapUrl;
      break;
    }
  }

  if (!collected.size) return null;

  const pageUrls = [...collected].sort((a, b) => a.localeCompare(b));
  return {
    sourceUrl,
    pageUrls,
    totalCount: pageUrls.length,
    truncated: pageUrls.length >= maxUrls,
  };
}

/** Compact paths for the AI prompt (e.g. /sprinkler-repair instead of full URL). */
export function sitemapPathsForPrompt(snapshot: SitemapPagesSnapshot): string[] {
  let base: string | null = null;
  try {
    const origin = new URL(snapshot.sourceUrl).origin;
    base = origin;
  } catch {
    base = null;
  }

  return snapshot.pageUrls.map((url) => {
    if (base && url.startsWith(base)) {
      const path = url.slice(base.length) || "/";
      return path.startsWith("/") ? path : `/${path}`;
    }
    try {
      const parsed = new URL(url);
      return `${parsed.pathname}${parsed.search}`;
    } catch {
      return url;
    }
  });
}
