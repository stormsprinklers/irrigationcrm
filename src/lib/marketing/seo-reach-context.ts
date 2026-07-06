import { getSearchConsoleDashboard } from "@/lib/google-search-console/client";
import { getWebsiteAnalyticsReport } from "@/lib/marketing/website-analytics";
import type { SeoReachContext } from "@/lib/marketing/seo-task-types";
import { prisma } from "@/lib/prisma";

const ANALYTICS_DAYS = 30;
const GSC_DAYS = 30;

export async function buildSeoReachContext(companyId: string): Promise<SeoReachContext> {
  const [company, organicKeywords, cities, rankingCaches, openTasks] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, website: true, organicSearchWebsiteUrl: true },
    }),
    prisma.localSeoKeyword.findMany({
      where: { companyId, channel: "ORGANIC" },
      orderBy: [{ sortOrder: "asc" }, { keyword: "asc" }],
      select: { keyword: true },
    }),
    prisma.localSeoTargetCity.findMany({
      where: { companyId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.localSeoRankingCache.findMany({
      where: { companyId, channel: "ORGANIC" },
      select: {
        keyword: true,
        ourRank: true,
        topBusinesses: true,
        cityId: true,
      },
    }),
    prisma.seoTask.findMany({
      where: { companyId, completed: false },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { title: true },
    }),
  ]);

  const cityNameById = new Map(cities.map((city) => [city.id, city.name]));

  const organicRankings = rankingCaches.map((row) => {
    const topBusinesses = Array.isArray(row.topBusinesses)
      ? (row.topBusinesses as Array<{ name?: string; rank?: number }>)
      : [];
    return {
      keyword: row.keyword,
      city: cityNameById.get(row.cityId) ?? row.cityId,
      rank: row.ourRank,
      topCompetitors: topBusinesses
        .slice(0, 3)
        .map((entry) => entry.name)
        .filter((name): name is string => Boolean(name)),
    };
  });

  let websiteAnalytics: SeoReachContext["websiteAnalytics"] = null;
  try {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - (ANALYTICS_DAYS - 1));
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);

    const report = await getWebsiteAnalyticsReport(companyId, { from, to });
    websiteAnalytics = {
      days: ANALYTICS_DAYS,
      totalPageViews: report.totalPageViews,
      totalSessions: report.totalSessions,
      organicConversions: report.conversions.organicConversions,
      topPages: report.topPages.slice(0, 8),
      topSourceBuckets: report.topSourceBuckets.slice(0, 6),
    };
  } catch {
    websiteAnalytics = null;
  }

  let searchConsole: SeoReachContext["searchConsole"] = null;
  try {
    const gsc = await getSearchConsoleDashboard(companyId, GSC_DAYS);
    searchConsole = {
      days: GSC_DAYS,
      clicks: gsc.overview.clicks,
      impressions: gsc.overview.impressions,
      ctr: gsc.overview.ctr,
      position: gsc.overview.position,
      topQueries: gsc.queries.slice(0, 12).map((row) => ({
        query: row.query,
        clicks: row.clicks,
        impressions: row.impressions,
        position: row.position,
      })),
      topPages: gsc.pages.slice(0, 10).map((row) => ({
        page: row.page,
        clicks: row.clicks,
        impressions: row.impressions,
        position: row.position,
      })),
    };
  } catch {
    searchConsole = null;
  }

  return {
    companyName: company?.name ?? "Company",
    websiteUrl: company?.organicSearchWebsiteUrl ?? company?.website ?? null,
    organicKeywords: organicKeywords.map((row) => row.keyword),
    targetCities: cities.map((city) => city.name),
    organicRankings,
    websiteAnalytics,
    searchConsole,
    existingOpenTasks: openTasks.map((task) => task.title),
  };
}
