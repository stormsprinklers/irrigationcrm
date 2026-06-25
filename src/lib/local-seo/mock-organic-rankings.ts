import type { RankingCity } from "@/lib/local-seo/ranking-types";
import type { SerpApiCityRanking, SerpApiRankingBusiness } from "@/lib/serpapi/types";
import { normalizeWebsiteHost } from "@/lib/serpapi/parse-organic-results";

const COMPETITOR_SITES = [
  "utahsprinklerpros.com",
  "mountainviewirrigation.com",
  "greenlawnsystems.com",
  "wasatchwaterworks.com",
  "premiersprinklerco.com",
  "alpineirrigation.com",
  "valleysprinklerrepair.com",
];

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function buildMockOrganicCityRanking(params: {
  city: RankingCity;
  keyword: string;
  websiteUrl: string;
}): SerpApiCityRanking {
  const host = normalizeWebsiteHost(params.websiteUrl) || "yourwebsite.com";
  const seed = hashString(`${params.city.id}:${params.keyword}:${host}`);
  const ourRank = (seed % 14) + 1;

  const leaderboard: SerpApiRankingBusiness[] = [];
  for (let rank = 1; rank <= 12; rank++) {
    if (rank === ourRank) {
      leaderboard.push({ rank, name: host, isOurs: true });
      continue;
    }

    const competitor = COMPETITOR_SITES[(seed + rank) % COMPETITOR_SITES.length];
    leaderboard.push({ rank, name: competitor, isOurs: false });
  }

  return {
    cityId: params.city.id,
    cityName: params.city.name,
    canonicalName: params.city.canonicalName,
    latitude: params.city.latitude,
    longitude: params.city.longitude,
    keyword: params.keyword,
    ourRank,
    topBusinesses: leaderboard.slice(0, 3),
  };
}

export function buildMockOrganicRankingsResponse(params: {
  cities: RankingCity[];
  keyword: string;
  websiteUrl: string;
}) {
  const trackedName = normalizeWebsiteHost(params.websiteUrl) || params.websiteUrl;

  return {
    keyword: params.keyword,
    businessName: trackedName,
    source: "mock" as const,
    updatedAt: new Date().toISOString(),
    cities: params.cities.map((city) =>
      buildMockOrganicCityRanking({
        city,
        keyword: params.keyword,
        websiteUrl: params.websiteUrl,
      })
    ),
  };
}
