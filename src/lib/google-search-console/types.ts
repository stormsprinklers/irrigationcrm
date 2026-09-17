export const SEARCH_CONSOLE_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

export type GscSite = {
  siteUrl: string;
  permissionLevel: string;
};

export type GscAnalyticsRow = {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscOverview = {
  siteUrl: string;
  startDate: string;
  endDate: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  pagesWithImpressions: number;
};

export type GscQueryRow = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscPageRow = {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscSitemap = {
  path: string;
  lastSubmitted?: string | null;
  isPending?: boolean;
  lastDownloaded?: string | null;
  warnings?: number;
  errors?: number;
};

export type GscDashboardData = {
  daily: { date: string; clicks: number; impressions: number; ctr: number; position: number; pagesWithImpressions: number }[];
  pageTrendLimited: boolean;
  overview: GscOverview;
  queries: GscQueryRow[];
  pages: GscPageRow[];
  sitemaps: GscSitemap[];
};

export type GscNotIndexedPage = {
  url: string;
  inspectionResultLink: string | null;
  coverageState: string | null;
  verdict: string | null;
  indexingState: string | null;
  robotsTxtState: string | null;
  pageFetchState: string | null;
  lastCrawlTime: string | null;
};

export type GscIndexCoverageData = {
  siteUrl: string;
  sitemapUrl: string | null;
  discoveredCount: number;
  checkedCount: number;
  excludedNoindexCount: number;
  inspectionErrorCount: number;
  truncated: boolean;
  nextOffset: number | null;
  notIndexedPages: GscNotIndexedPage[];
};

export type GscConnectionStatus = {
  connected: boolean;
  siteUrl: string | null;
  connectedAt: string | null;
  configured: boolean;
  oauthEnv: {
    hasClientId: boolean;
    hasClientSecret: boolean;
  };
};
