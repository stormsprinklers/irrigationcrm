import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type EventRow = {
  eventType: string;
  pagePath: string | null;
  metadata: Prisma.JsonValue;
  sessionId: string | null;
  occurredAt?: Date;
};

function metaString(metadata: Prisma.JsonValue, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function metaNumber(metadata: Prisma.JsonValue, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = Number((metadata as Record<string, unknown>)[key]);
  return Number.isFinite(value) ? value : null;
}

function metaBool(metadata: Prisma.JsonValue, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  return (metadata as Record<string, unknown>)[key] === true;
}

function isHomePath(pagePath: string | null) {
  return pagePath === "/" || pagePath === "";
}

export async function getWebsiteAnalyticsReport(
  companyId: string,
  params: { from: Date; to: Date }
) {
  const events = await prisma.marketingEvent.findMany({
    where: {
      companyId,
      source: "WEBSITE",
      eventType: { not: "VISITOR_HEARTBEAT" },
      occurredAt: { gte: params.from, lte: params.to },
    },
    select: {
      eventType: true,
      pagePath: true,
      metadata: true,
      sessionId: true,
      occurredAt: true,
    },
    orderBy: { occurredAt: "asc" },
  });

  return { ...summarizeWebsiteEvents(events), daily: summarizeWebsiteTimeline(events, params) };
}

export function summarizeWebsiteTimeline(events: EventRow[], params: { from: Date; to: Date }) {
  const byDate = new Map<string, EventRow[]>();
  const day = new Date(params.from);
  day.setUTCHours(0, 0, 0, 0);
  while (day <= params.to) {
    byDate.set(day.toISOString().slice(0, 10), []);
    day.setUTCDate(day.getUTCDate() + 1);
  }
  for (const event of events) {
    if (event.occurredAt && event.occurredAt >= params.from && event.occurredAt <= params.to) byDate.get(event.occurredAt.toISOString().slice(0, 10))?.push(event);
  }
  return [...byDate].map(([date, rows]) => ({ date, ...summarizeWebsiteEvents(rows) }));
}

export function summarizeWebsiteEvents(events: EventRow[]) {
  const pageViews = new Map<string, number>();
  const landingPages = new Map<string, number>();
  const utmSources = new Map<string, number>();
  const utmCampaigns = new Map<string, number>();
  const sourceBuckets = new Map<string, number>();
  const visitors = new Set<string>();

  let homepageScroll50 = 0;
  let homepageScroll90 = 0;
  let homepageDwellSamples = 0;
  let homepageDwellTotalSeconds = 0;
  const dwellByPageView = new Map<string, number>();
  let phoneClicks = 0;
  let smsClicks = 0;
  let formSubmits = 0;
  let bookingCompleted = 0;
  let organicConversions = 0;

  const conversionTypes = new Set([
    "TEL_CLICK",
    "SMS_CLICK",
    "FORM_SUBMIT",
    "BOOKING_COMPLETED",
    "PRICING_COMPLETED",
  ]);

  for (const event of events) {
    if (event.eventType === "VISITOR_HEARTBEAT") continue;
    if (event.sessionId) visitors.add(event.sessionId);
    const path = event.pagePath ?? "/";

    if (event.eventType === "PAGE_VIEW") {
      pageViews.set(path, (pageViews.get(path) ?? 0) + 1);
      if (metaBool(event.metadata, "is_new_session")) {
        landingPages.set(path, (landingPages.get(path) ?? 0) + 1);
      }
    }

    if (event.eventType === "SCROLL_DEPTH_50" && isHomePath(path)) homepageScroll50 += 1;
    if (event.eventType === "SCROLL_DEPTH_90" && isHomePath(path)) homepageScroll90 += 1;

    if (event.eventType === "TIME_ON_PAGE" && isHomePath(path)) {
      const seconds = metaNumber(event.metadata, "seconds");
      if (seconds != null && seconds >= 0) {
        const pageViewId = metaString(event.metadata, "page_view_id");
        if (pageViewId) {
          const key = `${event.sessionId ?? "anon"}:${pageViewId}`;
          dwellByPageView.set(key, Math.max(dwellByPageView.get(key) ?? 0, seconds));
        } else {
          // Historical events have one sample per page view and no page_view_id.
          homepageDwellSamples += 1;
          homepageDwellTotalSeconds += seconds;
        }
      }
    }

    if (event.eventType === "TEL_CLICK") phoneClicks += 1;
    if (event.eventType === "SMS_CLICK") smsClicks += 1;
    if (event.eventType === "FORM_SUBMIT") formSubmits += 1;
    if (event.eventType === "BOOKING_COMPLETED") bookingCompleted += 1;

    if (conversionTypes.has(event.eventType)) {
      const bucket = metaString(event.metadata, "source_bucket");
      if (bucket === "google_organic") organicConversions += 1;
    }

    const utmSource = metaString(event.metadata, "utm_source");
    const utmCampaign = metaString(event.metadata, "utm_campaign");
    const sourceBucket = metaString(event.metadata, "source_bucket");

    if (event.eventType === "PAGE_VIEW") {
      if (utmSource) utmSources.set(utmSource, (utmSources.get(utmSource) ?? 0) + 1);
      if (utmCampaign) utmCampaigns.set(utmCampaign, (utmCampaigns.get(utmCampaign) ?? 0) + 1);
      if (sourceBucket) sourceBuckets.set(sourceBucket, (sourceBuckets.get(sourceBucket) ?? 0) + 1);
    }
  }

  const sortEntries = (map: Map<string, number>, limit = 10) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([label, count]) => ({ label, count }));

  const totalPageViews = [...pageViews.values()].reduce((sum, n) => sum + n, 0);
  const totalSessions = [...landingPages.values()].reduce((sum, n) => sum + n, 0);
  homepageDwellSamples += dwellByPageView.size;
  homepageDwellTotalSeconds += [...dwellByPageView.values()].reduce((sum, seconds) => sum + seconds, 0);

  return {
    totalEvents: events.filter((e) => e.eventType !== "VISITOR_HEARTBEAT").length,
    totalVisitors: visitors.size,
    totalPageViews,
    totalSessions,
    homepage: {
      scroll50: homepageScroll50,
      scroll90: homepageScroll90,
      avgDwellSeconds:
        homepageDwellSamples > 0
          ? Math.round(homepageDwellTotalSeconds / homepageDwellSamples)
          : null,
      dwellSamples: homepageDwellSamples,
    },
    conversions: {
      phoneClicks,
      smsClicks,
      formSubmits,
      bookingCompleted,
      organicConversions,
      total: phoneClicks + smsClicks + formSubmits + bookingCompleted,
    },
    topPages: sortEntries(pageViews),
    topLandingPages: sortEntries(landingPages),
    topUtmSources: sortEntries(utmSources),
    topUtmCampaigns: sortEntries(utmCampaigns),
    topSourceBuckets: sortEntries(sourceBuckets),
  };
}
