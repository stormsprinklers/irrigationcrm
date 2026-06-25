import { SERPAPI_DEVICE } from "@/lib/serpapi/constants";
import {
  businessNamesMatch,
  canonicalNameToSerpLocation,
  parseGoogleLocalRankings,
  type GoogleLocalResult,
} from "@/lib/serpapi/parse-local-results";
import {
  parseOrganicRankings,
  type GoogleOrganicResult,
} from "@/lib/serpapi/parse-organic-results";
import type { SerpApiRankingBusiness } from "@/lib/serpapi/types";

export function isSerpApiConfigured() {
  return Boolean(process.env.SERPAPI_API_KEY?.trim());
}

export function getSerpApiApiKey() {
  const apiKey = process.env.SERPAPI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("SERPAPI_API_KEY is not configured");
  }
  return apiKey;
}

type SerpApiFetchOptions = {
  apiKey: string;
  endpoint: string;
};

type SerpApiResponse = {
  search_metadata?: {
    status?: string;
    error?: string;
  };
  local_results?: GoogleLocalResult[];
  organic_results?: GoogleOrganicResult[];
  error?: string;
};

export async function serpApiFetch<T>(
  url: URL,
  _options: SerpApiFetchOptions
): Promise<T> {
  if (!url.searchParams.has("api_key")) {
    url.searchParams.set("api_key", _options.apiKey);
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const data = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : `SerpAPI request failed (${response.status})`
    );
  }

  return data;
}

function applyCommonSearchParams(url: URL) {
  url.searchParams.set("google_domain", "google.com");
  url.searchParams.set("gl", "us");
  url.searchParams.set("hl", "en");
  url.searchParams.set("device", SERPAPI_DEVICE);
}

export async function fetchGoogleLocalResults(params: {
  keyword: string;
  location: string;
}) {
  const apiKey = getSerpApiApiKey();
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_local");
  url.searchParams.set("q", params.keyword);
  url.searchParams.set("location", params.location);
  applyCommonSearchParams(url);

  const data = await serpApiFetch<SerpApiResponse>(url, {
    apiKey,
    endpoint: "google_local",
  });

  if (data.search_metadata?.status === "Error") {
    throw new Error(data.search_metadata.error ?? data.error ?? "SerpAPI google_local error");
  }

  return data.local_results ?? [];
}

export async function fetchGoogleOrganicResults(params: {
  keyword: string;
  location: string;
}) {
  const apiKey = getSerpApiApiKey();
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", params.keyword);
  url.searchParams.set("location", params.location);
  applyCommonSearchParams(url);

  const data = await serpApiFetch<SerpApiResponse>(url, {
    apiKey,
    endpoint: "google",
  });

  if (data.search_metadata?.status === "Error") {
    throw new Error(data.search_metadata.error ?? data.error ?? "SerpAPI google search error");
  }

  return data.organic_results ?? [];
}

export async function fetchLocalPackRankings(params: {
  keyword: string;
  canonicalName: string;
  businessName: string;
}) {
  const location = canonicalNameToSerpLocation(params.canonicalName);
  const localResults = await fetchGoogleLocalResults({
    keyword: params.keyword,
    location,
  });

  const parsed = parseGoogleLocalRankings(localResults, params.businessName);

  return {
    locationUsed: location,
    ourRank: parsed.ourRank,
    topBusinesses: parsed.topBusinesses as SerpApiRankingBusiness[],
  };
}

export async function fetchOrganicRankings(params: {
  keyword: string;
  canonicalName: string;
  websiteUrl: string;
}) {
  const location = canonicalNameToSerpLocation(params.canonicalName);
  const organicResults = await fetchGoogleOrganicResults({
    keyword: params.keyword,
    location,
  });

  const parsed = parseOrganicRankings(organicResults, params.websiteUrl);

  return {
    locationUsed: location,
    ourRank: parsed.ourRank,
    topBusinesses: parsed.topBusinesses as SerpApiRankingBusiness[],
  };
}

export { businessNamesMatch, canonicalNameToSerpLocation };
