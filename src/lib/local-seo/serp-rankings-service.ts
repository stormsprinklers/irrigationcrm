import type { LocalSeoChannel } from "@prisma/client";
import { buildMockRankingsResponse } from "@/lib/local-seo/mock-rankings";
import { buildMockOrganicRankingsResponse } from "@/lib/local-seo/mock-organic-rankings";
import type { RankingCity } from "@/lib/local-seo/ranking-types";
import {
  fetchLocalPackRankings,
  fetchOrganicRankings,
  isSerpApiConfigured,
} from "@/lib/serpapi/client";
import {
  getAllowedSearchCount,
  getSerpApiQuotaUsage,
  isCacheFresh,
  type SerpApiQuotaSnapshot,
} from "@/lib/serpapi/quota";
import type { SerpApiCityRanking, SerpApiRankingsResponse } from "@/lib/serpapi/types";
import { prisma } from "@/lib/prisma";

type GetRankingsOptions = {
  companyId: string;
  channel: LocalSeoChannel;
  keyword: string;
  trackedName: string;
  websiteUrl?: string | null;
  cities: RankingCity[];
  refresh?: boolean;
  forceMock?: boolean;
};

async function countSerpSearches(args: { since: Date }) {
  return prisma.localSeoSerpSearch.count({
    where: {
      createdAt: { gte: args.since },
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
    topBusinesses: cache.topBusinesses as SerpApiCityRanking["topBusinesses"],
  };
}

function buildMockResponse(options: GetRankingsOptions) {
  if (options.channel === "ORGANIC") {
    return buildMockOrganicRankingsResponse({
      cities: options.cities,
      keyword: options.keyword,
      websiteUrl: options.websiteUrl ?? options.trackedName,
    });
  }

  return buildMockRankingsResponse({
    cities: options.cities,
    keyword: options.keyword,
    businessName: options.trackedName,
  });
}

export async function getSerpRankings(options: GetRankingsOptions): Promise<SerpApiRankingsResponse> {
  const {
    companyId,
    channel,
    keyword,
    trackedName,
    websiteUrl,
    cities,
    refresh = false,
    forceMock = false,
  } = options;

  if (!forceMock && !isSerpApiConfigured()) {
    return buildMockResponse(options);
  }

  if (forceMock) {
    return buildMockResponse(options);
  }

  if (channel === "ORGANIC" && !websiteUrl?.trim()) {
    throw new Error("Set your website URL in Settings → Search rankings before refreshing organic rankings");
  }

  const endpoint = channel === "ORGANIC" ? "google" : "google_local";
  const quota = await getSerpApiQuotaUsage(countSerpSearches);
  const cacheRows = await prisma.localSeoRankingCache.findMany({
    where: { companyId, channel, keyword },
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
    const result =
      channel === "ORGANIC"
        ? await fetchOrganicRankings({
            keyword,
            canonicalName: city.canonicalName,
            websiteUrl: websiteUrl!,
          })
        : await fetchLocalPackRankings({
            keyword,
            canonicalName: city.canonicalName,
            businessName: trackedName,
          });

    await logSerpSearch({
      companyId,
      endpoint,
      keyword,
      cityId: city.id,
    });
    searchesThisRequest += 1;

    const saved = await prisma.localSeoRankingCache.upsert({
      where: {
        companyId_channel_keyword_cityId: {
          companyId,
          channel,
          keyword,
          cityId: city.id,
        },
      },
      create: {
        companyId,
        channel,
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
    hasMissingData && !refresh ? "cache_only" : citiesSkipped > 0 ? "partial" : "full";

  return {
    keyword,
    businessName: trackedName,
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
    message = `SerpAPI quota reached. ${citiesSkipped} location ranking${citiesSkipped === 1 ? "" : "s"} were not refreshed. Cached results are shown where available.`;
  } else if (refresh && citiesNeedingFetch > 0 && searchesThisRequest === 0) {
    message = `SerpAPI quota exhausted (${quota.hourlyUsed}/${quota.hourlyLimit} this hour · ${quota.monthlyUsed}/${quota.monthlyLimit} this month). Showing cached rankings only.`;
  } else if (refresh && searchesThisRequest === 0) {
    message = "All location rankings are already cached. Results refresh automatically after the cache expires.";
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
    device: "mobile" as const,
    quota,
  };
}

/** @deprecated Use getSerpRankings */
export async function getLocalSeoRankings(
  options: Omit<GetRankingsOptions, "channel"> & { businessName: string }
) {
  return getSerpRankings({
    ...options,
    channel: "GBP",
    trackedName: options.businessName,
  });
}
