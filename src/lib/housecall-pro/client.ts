import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_THROTTLE_MS,
  HCP_BASE_URL,
  HCP_MAX_PAGE_SIZE,
  MAX_429_RETRIES,
} from "@/lib/housecall-pro/constants";
import type { HcpRecord, PaginatedFetchResult } from "@/lib/housecall-pro/types";

export function getHousecallProApiKey() {
  return process.env.HOUSECALL_PRO_API_KEY ?? "";
}

export function assertHousecallProConfigured() {
  const key = getHousecallProApiKey();
  if (!key) {
    throw new Error("HOUSECALL_PRO_API_KEY is not configured");
  }
  return key;
}

type GetOptions = {
  params?: Record<string, string | number | undefined>;
  throttleMs?: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildUrl(path: string, params?: Record<string, string | number | undefined>) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${HCP_BASE_URL}${normalized}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

function extractArray(data: HcpRecord, keys: string[]): HcpRecord[] {
  for (const key of keys) {
    const value = data[key];
    if (Array.isArray(value)) return value as HcpRecord[];
  }
  if (Array.isArray(data.data)) return data.data as HcpRecord[];
  return [];
}

function extractNextCursor(data: HcpRecord, currentPage: number): string | null {
  if (typeof data.next_page_url === "string" && data.next_page_url) {
    return data.next_page_url;
  }
  if (typeof data.next_cursor === "string" && data.next_cursor) {
    return data.next_cursor;
  }
  const totalPages = Number(data.total_pages ?? data.totalPages);
  if (Number.isFinite(totalPages) && currentPage < totalPages) {
    return String(currentPage + 1);
  }
  const page = Number(data.page ?? currentPage);
  const pageSize = Number(data.page_size ?? data.pageSize ?? 0);
  const total = Number(data.total_count ?? data.totalCount ?? data.total ?? 0);
  if (pageSize > 0 && total > page * pageSize) {
    return String(page + 1);
  }
  return null;
}

function extractTotal(data: HcpRecord): number | undefined {
  const total = Number(data.total_count ?? data.totalCount ?? data.total);
  return Number.isFinite(total) ? total : undefined;
}

export class HousecallProClient {
  private lastRequestAt = 0;
  private readonly resolvedPaths = new Map<string, string>();

  constructor(private readonly apiKey: string) {}

  private async throttle(ms: number) {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < ms) await sleep(ms - elapsed);
    this.lastRequestAt = Date.now();
  }

  async get<T extends HcpRecord = HcpRecord>(path: string, options: GetOptions = {}): Promise<T> {
    const throttleMs = options.throttleMs ?? DEFAULT_THROTTLE_MS;
    const url = buildUrl(path, options.params);

    for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
      await this.throttle(throttleMs);
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
        },
        cache: "no-store",
      });

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after") ?? 0);
        const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(60000, 1000 * 2 ** attempt);
        await sleep(waitMs);
        continue;
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`HCP ${response.status} ${path}: ${body.slice(0, 300)}`);
      }

      return (await response.json()) as T;
    }

    throw new Error(`HCP rate limited after retries: ${path}`);
  }

  async getPaginated(
    path: string,
    options: {
      cursor?: string | null;
      pageSize?: number;
      arrayKeys: string[];
      throttleMs?: number;
    }
  ): Promise<PaginatedFetchResult<HcpRecord>> {
    const pageSize = Math.min(options.pageSize ?? DEFAULT_BATCH_SIZE, HCP_MAX_PAGE_SIZE);
    let page = 1;

    if (options.cursor) {
      if (options.cursor.startsWith("http")) {
        const response = await fetch(options.cursor, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            Accept: "application/json",
          },
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`HCP pagination failed: ${response.status}`);
        }
        const data = (await response.json()) as HcpRecord;
        return {
          items: extractArray(data, options.arrayKeys),
          nextCursor: extractNextCursor(data, page),
          totalEstimate: extractTotal(data),
        };
      }
      page = Number(options.cursor) || 1;
    }

    const data = await this.get<HcpRecord>(path, {
      params: { page, page_size: pageSize },
      throttleMs: options.throttleMs,
    });

    return {
      items: extractArray(data, options.arrayKeys),
      nextCursor: extractNextCursor(data, page),
      totalEstimate: extractTotal(data),
    };
  }

  async getPaginatedFirst(
    paths: readonly string[],
    options: {
      cursor?: string | null;
      pageSize?: number;
      arrayKeys: string[];
      throttleMs?: number;
    }
  ): Promise<PaginatedFetchResult<HcpRecord>> {
    const cacheKey = paths.join("|");
    const cached = this.resolvedPaths.get(cacheKey);
    if (cached) {
      return this.getPaginated(cached, options);
    }

    let lastError: Error | null = null;
    const attempted: string[] = [];
    for (const path of paths) {
      attempted.push(path);
      try {
        const result = await this.getPaginated(path, options);
        this.resolvedPaths.set(cacheKey, path);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!message.includes("404")) throw err;
        lastError = err instanceof Error ? err : new Error(message);
      }
    }

    const tried = attempted.join(", ");
    const detail = lastError?.message ?? "unknown error";
    throw new Error(`HCP 404: tried [${tried}]. ${detail}`);
  }

  async downloadBinary(url: string): Promise<{ buffer: ArrayBuffer; contentType: string }> {
    await this.throttle(DEFAULT_THROTTLE_MS);
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`HCP download failed: ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    return {
      buffer,
      contentType: response.headers.get("content-type") ?? "application/octet-stream",
    };
  }
}

export function createHousecallProClient() {
  return new HousecallProClient(assertHousecallProConfigured());
}
