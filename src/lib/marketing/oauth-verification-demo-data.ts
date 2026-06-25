import type { GbpPerformanceSummary } from "@/lib/google-business/types";
import type { GscDashboardData } from "@/lib/google-search-console/types";

const DEMO_START = "2026-02-24";
const DEMO_END = "2026-03-25";

export const OAUTH_DEMO_SCOPES = [
  {
    id: "business.manage",
    scope: "https://www.googleapis.com/auth/business.manage",
    product: "Google Business Profile",
    purpose:
      "Read local business performance metrics (impressions, calls, direction requests, website clicks) for the connected location.",
    apis: ["Business Profile Performance API", "Business Profile Account Management API"],
    redirectPath: "/api/marketing/google-business/callback",
    crmPath: "/marketing/google-business",
  },
  {
    id: "webmasters.readonly",
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    product: "Google Search Console",
    purpose:
      "Read search analytics (queries, impressions, clicks, CTR, average position) and sitemap status for verified properties.",
    apis: ["Search Console API (searchanalytics.query, sites, sitemaps)"],
    redirectPath: "/api/marketing/search-console/callback",
    crmPath: "/marketing/seo",
  },
] as const;

export const DEMO_GSC_SITE = "sc-domain:stormsprinklers.com";
export const DEMO_GBP_LOCATION = "Storm Sprinklers — Utah County";

/** Sample organic conversion count for Search Console preview (native website tracking). */
export const DEMO_WEBSITE_ORGANIC_CONVERSIONS = 94;

export function buildDemoGscDashboard(): GscDashboardData {
  return {
    overview: {
      siteUrl: DEMO_GSC_SITE,
      startDate: DEMO_START,
      endDate: DEMO_END,
      clicks: 1284,
      impressions: 28450,
      ctr: 0.0451,
      position: 8.6,
      pagesWithImpressions: 47,
    },
    queries: [
      { query: "sprinkler repair utah", clicks: 186, impressions: 4200, ctr: 0.0443, position: 6.2 },
      { query: "sprinkler installation near me", clicks: 142, impressions: 3100, ctr: 0.0458, position: 7.1 },
      { query: "irrigation repair", clicks: 98, impressions: 2800, ctr: 0.035, position: 9.4 },
      { query: "storm sprinklers", clicks: 76, impressions: 890, ctr: 0.0854, position: 2.1 },
      { query: "sprinkler blowout utah", clicks: 54, impressions: 1650, ctr: 0.0327, position: 11.2 },
    ],
    pages: [
      {
        page: "https://www.stormsprinklers.com/",
        clicks: 420,
        impressions: 9800,
        ctr: 0.0429,
        position: 7.8,
      },
      {
        page: "https://www.stormsprinklers.com/sprinkler-repair",
        clicks: 310,
        impressions: 6200,
        ctr: 0.05,
        position: 6.5,
      },
      {
        page: "https://www.stormsprinklers.com/book",
        clicks: 185,
        impressions: 4100,
        ctr: 0.0451,
        position: 8.2,
      },
    ],
    sitemaps: [
      {
        path: "https://www.stormsprinklers.com/sitemap.xml",
        lastSubmitted: "2026-03-01T00:00:00Z",
        lastDownloaded: "2026-03-24T00:00:00Z",
        warnings: 0,
        errors: 0,
      },
    ],
  };
}

export function buildDemoGbpPerformance(): GbpPerformanceSummary {
  return {
    locationId: "locations/demo-storm-sprinklers",
    locationTitle: DEMO_GBP_LOCATION,
    startDate: DEMO_START,
    endDate: DEMO_END,
    totals: { impressions: 12480, interactions: 892 },
    metrics: [
      {
        metric: "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
        label: "Map impressions (mobile)",
        total: 4200,
        dailyValues: [],
      },
      {
        metric: "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
        label: "Search impressions (mobile)",
        total: 5100,
        dailyValues: [],
      },
      {
        metric: "CALL_CLICKS",
        label: "Call clicks",
        total: 312,
        dailyValues: [],
      },
      {
        metric: "WEBSITE_CLICKS",
        label: "Website clicks",
        total: 428,
        dailyValues: [],
      },
      {
        metric: "BUSINESS_DIRECTION_REQUESTS",
        label: "Direction requests",
        total: 152,
        dailyValues: [],
      },
    ],
  };
}

export const OAUTH_FLOW_STEPS = [
  {
    step: 1,
    title: "User initiates connect",
    detail:
      "An authenticated CRM admin clicks Connect on Marketing → SEO or Google Business Profile. The app redirects to Google OAuth with only the scope required for that integration.",
  },
  {
    step: 2,
    title: "Google consent screen",
    detail:
      "The user signs in with their Google account and grants read-only access to their own Search Console or Business Profile data.",
  },
  {
    step: 3,
    title: "Secure token storage",
    detail:
      "The CRM stores a refresh token server-side (encrypted at rest in PostgreSQL). Tokens are never exposed to the browser or other users.",
  },
  {
    step: 4,
    title: "Read-only API calls",
    detail:
      "When the dashboard loads, the CRM server uses the refresh token to call Google APIs and display metrics. No data is sold, shared with third parties, or written back to Google.",
  },
  {
    step: 5,
    title: "Disconnect",
    detail:
      "The admin can disconnect at any time, which deletes stored tokens and stops all API access.",
  },
] as const;
