export type LocalSeoKeywordRecord = {
  id: string;
  keyword: string;
  sortOrder: number;
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

export type LocalSeoSettings = {
  keywords: LocalSeoKeywordRecord[];
  cities: LocalSeoTargetCityRecord[];
};
