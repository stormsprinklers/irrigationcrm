export type SeoTaskCategory =
  | "content"
  | "backlinks"
  | "technical"
  | "local"
  | "on-page"
  | "other";

export type SeoAiRecommendation = {
  title: string;
  description: string;
  category: SeoTaskCategory;
  rationale: string;
  priority: number;
};

export type SeoAiRecommendationsResponse = {
  recommendations: SeoAiRecommendation[];
  summary?: string;
};

export type SeoTaskDto = {
  id: string;
  title: string;
  description: string;
  category: string | null;
  rationale: string | null;
  priority: number;
  completed: boolean;
  completedAt: string | null;
  source: string;
  batchId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SeoReachContext = {
  companyName: string;
  websiteUrl: string | null;
  organicKeywords: string[];
  targetCities: string[];
  organicRankings: Array<{
    keyword: string;
    city: string;
    rank: number | null;
    topCompetitors: string[];
  }>;
  websiteAnalytics: {
    days: number;
    totalPageViews: number;
    totalSessions: number;
    organicConversions: number;
    topPages: Array<{ label: string; count: number }>;
    topSourceBuckets: Array<{ label: string; count: number }>;
  } | null;
  searchConsole: {
    days: number;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
    topQueries: Array<{ query: string; clicks: number; impressions: number; position: number }>;
    topPages: Array<{ page: string; clicks: number; impressions: number; position: number }>;
  } | null;
  existingOpenTasks: string[];
};
