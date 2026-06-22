export const GOOGLE_BUSINESS_SCOPE = "https://www.googleapis.com/auth/business.manage";

export const GBP_PERFORMANCE_METRICS = [
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  "BUSINESS_DIRECTION_REQUESTS",
  "CALL_CLICKS",
  "WEBSITE_CLICKS",
  "BUSINESS_CONVERSATIONS",
] as const;

export type GbpDailyMetric = (typeof GBP_PERFORMANCE_METRICS)[number];

export const GBP_METRIC_LABELS: Record<GbpDailyMetric, string> = {
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: "Map impressions (desktop)",
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: "Search impressions (desktop)",
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: "Map impressions (mobile)",
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: "Search impressions (mobile)",
  BUSINESS_DIRECTION_REQUESTS: "Direction requests",
  CALL_CLICKS: "Call clicks",
  WEBSITE_CLICKS: "Website clicks",
  BUSINESS_CONVERSATIONS: "Message conversations",
};

export type GbpAccount = {
  name: string;
  accountName: string;
  type?: string;
};

export type GbpLocation = {
  name: string;
  title: string;
  address?: string | null;
};

export type GbpDailyValue = {
  date: string;
  value: number;
};

export type GbpMetricSeries = {
  metric: GbpDailyMetric;
  label: string;
  total: number;
  dailyValues: GbpDailyValue[];
};

export type GbpPerformanceSummary = {
  locationId: string;
  locationTitle: string;
  startDate: string;
  endDate: string;
  metrics: GbpMetricSeries[];
  totals: {
    impressions: number;
    interactions: number;
  };
};

export type GbpCatalogCache = {
  accounts?: GbpAccount[];
  accountsFetchedAt?: string;
  locationsByAccount?: Record<string, GbpLocation[]>;
  locationsFetchedAt?: Record<string, string>;
};

export type GbpConnectionStatus = {
  connected: boolean;
  accountId: string | null;
  locationId: string | null;
  locationTitle: string | null;
  connectedAt: string | null;
  configured: boolean;
  oauthEnv: {
    hasClientId: boolean;
    hasClientSecret: boolean;
  };
};
