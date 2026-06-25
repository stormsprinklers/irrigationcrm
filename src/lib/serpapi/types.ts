/** SerpAPI Google Maps location object (from locations.json). */
export type SerpApiLocation = {
  id: string;
  google_id?: number;
  google_parent_id?: number;
  name: string;
  canonical_name: string;
  country_code: string;
  target_type: string;
  reach?: number;
  /** [longitude, latitude] */
  gps: [number, number];
};

export type SerpApiRankingBusiness = {
  rank: number;
  name: string;
  isOurs: boolean;
};

export type SerpApiCityRanking = {
  cityId: string;
  cityName: string;
  canonicalName: string;
  latitude: number;
  longitude: number;
  keyword: string;
  ourRank: number | null;
  topBusinesses: SerpApiRankingBusiness[];
};

export type SerpApiRankingsResponse = {
  keyword: string;
  businessName: string;
  source: "mock" | "serpapi";
  updatedAt: string;
  cities: SerpApiCityRanking[];
};
