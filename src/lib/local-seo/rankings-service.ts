import { buildMockRankingsResponse } from "@/lib/local-seo/mock-rankings";
import { fetchLocalPackRankings, isSerpApiConfigured } from "@/lib/serpapi/client";
import {
  getAllowedSearchCount,
  getSerpApiQuotaUsage,
  isCacheFresh,
  type SerpApiQuotaSnapshot,
} from "@/lib/serpapi/quota";
import type {
  SerpApiCityRanking,
  SerpApiRankingBusiness,
  SerpApiRankingsResponse,
} from "@/lib/serpapi/types";
import { prisma } from "@/lib/prisma";

type RankingCity = {
  id: string;
  name: string;
  canonicalName: string;
  latitude: number;
  longitude: number;
};

type GetRankingsOptions = {
  companyId: string;
  keyword: string;
  businessName: string;
  cities: RankingCity[];
  refresh?: boolean;
  forceMock?: boolean;
};

async function countSerpSearches(args: { since: Date; endpoint?: string }) {
  return prisma.localSeoSerpSearch.count({
    where: {
      createdAt: { gte: args.since },
      ...(args.endpoint ? { endpoint: args.endpoint } : {}),
    },
  });
}

async function logSerpSearch(params: {
  companyId: string;
  endpoint: string;
  keyword?: string;
  cityId?: string;
}) {
  await prisma.localSeoSerpSearch.create({
    data: {
      companyId: params.companyId,
      endpoint: params.endpoint,
      keyword: params.keyword ?? null,
      cityId: params.cityId ?? null,
    },
  });
}

function cacheEntryToRanking(
  city: RankingCity,
  keyword: string,
  cache: {
    ourRank: number | null;
    topBusinesses: unknown;
  }
): SerpApiCityRanking {
  return {
    cityId: city.id,
    cityName: city.name,
    canonicalName: city.canonicalName,
    latitude: city.latitude,
    longitude: city.longitude,
    keyword,
    ourRank: cache.ourRank,
    topBusinesses: cache.topBusinesses as SerpApiRankingBusiness[],
  };
}

export async function getLocalSeoRankings(
  options: GetRankingsOptions
): Promise<SerpApiRankingsResponse> {
  const { companyId, keyword, businessName, cities, refresh = false, forceMock = false } = options;

  if (!forceMock && !isSerpApiConfigured()) {
    return buildMockRankingsResponse({ cities, keyword, businessName });
  }

  if (forceMock) {
    return buildMockRankingsResponse({ cities, keyword, businessName });
  }

  const quota = await getSerpApiQuotaUsage(countSerpSearches);
  const cacheRows = await prisma.localSeoRankingCache.findMany({
    where: { companyId, keyword },
    select: {
      cityId: true,
      ourRank: true,
      topBusinesses: true,
      fetchedAt: true,
    },
  });

  const cacheByCityId = new Map(cacheRows.map((row) => [row.cityId, row]));
  const now = new Date();

  const citiesNeedingFetch = refresh
    ? cities.filter((city) => {
        const cached = cacheByCityId.get(city.id);
        return !cached || !isCacheFresh(cached.fetchedAt, now);
      })
    : [];

  const allowedFetches = getAllowedSearchCount(quota, citiesNeedingFetch.length);
  const citiesToFetch = citiesNeedingFetch.slice(0, allowedFetches);
  const citiesSkipped = citiesNeedingFetch.length - citiesToFetch.length;

  let searchesThisRequest = 0;

  for (const city of citiesToFetch) {
    const result = await fetchLocalPackRankings({
      keyword,
      canonicalName: city.canonicalName,
      businessName,
    });

    await logSerpSearch({
      companyId,
      endpoint: "google_local",
      keyword,
      cityId: city.id,
    });
    searchesThisRequest += 1;

    const saved = await prisma.localSeoRankingCache.upsert({
      where: {
        companyId_keyword_cityId: {
          companyId,
          keyword,
          cityId: city.id,
        },
      },
      create: {
        companyId,
        keyword,
        cityId: city.id,
        ourRank: result.ourRank,
        topBusinesses: result.topBusinesses,
      },
      update: {
        ourRank: result.ourRank,
        topBusinesses: result.topBusinesses,
        fetchedAt: new Date(),
      },
      select: {
        cityId: true,
        ourRank: true,
        topBusinesses: true,
        fetchedAt: true,
      },
    });

    cacheByCityId.set(city.id, saved);
  }

  const updatedQuota =
    searchesThisRequest > 0 ? await getSerpApiQuotaUsage(countSerpSearches) : quota;

  const rankingCities: SerpApiCityRanking[] = cities.map((city) => {
    const cached = cacheByCityId.get(city.id);
    if (cached) {
      return cacheEntryToRanking(city, keyword, cached);
    }

    return {
      cityId: city.id,
      cityName: city.name,
      canonicalName: city.canonicalName,
      latitude: city.latitude,
      longitude: city.longitude,
      keyword,
      ourRank: null,
      topBusinesses: [],
    };
  });

  const latestFetchedAt = [...cacheByCityId.values()].reduce<Date | null>((latest, row) => {
    if (!latest || row.fetchedAt > latest) return row.fetchedAt;
    return latest;
  }, null);

  const hasMissingData = rankingCities.some((city) => city.topBusinesses.length === 0);
  const cacheStatus =
    hasMissingData && !refresh
      ? "cache_only"
      : citiesSkipped > 0
        ? "partial"
        : "full";

  return {
    keyword,
    businessName,
    source: "serpapi",
    updatedAt: (latestFetchedAt ?? now).toISOString(),
    cities: rankingCities,
    quota: buildQuotaMeta(
      updatedQuota,
      searchesThisRequest,
      citiesSkipped,
      refresh,
      citiesNeedingFetch.length
    ),
    cacheStatus,
  };
}

function buildQuotaMeta(
  quota: SerpApiQuotaSnapshot,
  searchesThisRequest: number,
  citiesSkipped: number,
  refresh: boolean,
  citiesNeedingFetch: number
) {
  let message: string | undefined;

  if (citiesSkipped > 0) {
    message = `SerpAPI quota reached. ${citiesSkipped} city ranking${citiesSkipped === 1 ? "" : "s"} were not refreshed. Cached results are shown where available.`;
  } else if (refresh && citiesNeedingFetch > 0 && searchesThisRequest === 0) {
    message = `SerpAPI quota exhausted (${quota.hourlyUsed}/${quota.hourlyLimit} this hour · ${quota.monthlyUsed}/${quota.monthlyLimit} this month). Showing cached rankings only.`;
  } else if (refresh && searchesThisRequest === 0) {
    message = "All city rankings are already cached. Results refresh automatically after the cache expires.";
  }

  return {
    hourlyLimit: quota.hourlyLimit,
    monthlyLimit: quota.monthlyLimit,
    hourlyUsed: quota.hourlyUsed,
    monthlyUsed: quota.monthlyUsed,
    hourlyRemaining: quota.hourlyRemaining,
    monthlyRemaining: quota.monthlyRemaining,
    searchesThisRequest,
    citiesSkipped: citiesSkipped || undefined,
    message,
  };
}

export async function getSerpQuotaStatus() {
  const quota = await getSerpApiQuotaUsage(countSerpSearches);
  return {
    configured: isSerpApiConfigured(),
    liveRankingsEnabled: isSerpApiConfigured(),
    quota,
  };
}
