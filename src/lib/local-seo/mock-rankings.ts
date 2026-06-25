import type { RankingCity } from "@/lib/local-seo/ranking-types";
import type { SerpApiCityRanking, SerpApiRankingBusiness } from "@/lib/serpapi/types";

const COMPETITOR_NAMES = [
  "Utah Sprinkler Pros",
  "Mountain View Irrigation",
  "Green Lawn Systems",
  "Wasatch Water Works",
  "Premier Sprinkler Co",
  "Alpine Irrigation",
  "Valley Sprinkler Repair",
  "Peak Performance Lawn",
  "Desert Rain Sprinklers",
  "Summit Outdoor Services",
  "Blue Line Irrigation",
  "Cascade Lawn Care",
];

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function pickCompetitors(seed: number, count: number) {
  const names = [...COMPETITOR_NAMES];
  const picked: string[] = [];
  let state = seed;

  while (picked.length < count && names.length > 0) {
    state = (state * 1664525 + 1013904223) % 4294967296;
    const index = state % names.length;
    picked.push(names.splice(index, 1)[0]);
  }

  return picked;
}

export function buildMockCityRanking(params: {
  city: RankingCity;
  keyword: string;
  businessName: string;
}): SerpApiCityRanking {
  const seed = hashString(`${params.city.id}:${params.keyword}:${params.businessName}`);
  const ourRank = (seed % 14) + 1;
  const competitors = pickCompetitors(seed, 12);

  const leaderboard: SerpApiRankingBusiness[] = [];
  let competitorIndex = 0;

  for (let rank = 1; rank <= 12; rank++) {
    if (rank === ourRank) {
      leaderboard.push({ rank, name: params.businessName, isOurs: true });
      continue;
    }

    leaderboard.push({
      rank,
      name: competitors[competitorIndex++] ?? `Local competitor ${rank}`,
      isOurs: false,
    });
  }

  const topBusinesses = leaderboard.slice(0, 3);

  return {
    cityId: params.city.id,
    cityName: params.city.name,
    canonicalName: params.city.canonicalName,
    latitude: params.city.latitude,
    longitude: params.city.longitude,
    keyword: params.keyword,
    ourRank,
    topBusinesses,
  };
}

export function buildMockRankingsResponse(params: {
  cities: RankingCity[];
  keyword: string;
  businessName: string;
}) {
  return {
    keyword: params.keyword,
    businessName: params.businessName,
    source: "mock" as const,
    updatedAt: new Date().toISOString(),
    cities: params.cities.map((city) =>
      buildMockCityRanking({
        city,
        keyword: params.keyword,
        businessName: params.businessName,
      })
    ),
  };
}
