import type { LocalSeoChannel } from "@prisma/client";

export type SerpRankingsChannel = LocalSeoChannel;

export type LocalSeoKeywordRecord = {
  id: string;
  keyword: string;
  sortOrder: number;
  channel: SerpRankingsChannel;
};

export type LocalSeoTargetCityRecord = {
  id: string;
  serpApiId: string | null;
  googleId: number | null;
  name: string;
  canonicalName: string;
  countryCode: string;
  targetType: string;
  latitude: number;
  longitude: number;
  sortOrder: number;
};

export type SerpRankingsSettings = {
  organicSearchWebsiteUrl: string | null;
  gbpKeywords: LocalSeoKeywordRecord[];
  organicKeywords: LocalSeoKeywordRecord[];
  cities: LocalSeoTargetCityRecord[];
};

/** @deprecated Use SerpRankingsSettings */
export type LocalSeoSettings = {
  keywords: LocalSeoKeywordRecord[];
  cities: LocalSeoTargetCityRecord[];
};
