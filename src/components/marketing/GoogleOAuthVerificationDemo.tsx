"use client";

import Link from "next/link";
import { format } from "date-fns";
import { Building2, Globe, Search, Shield, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  MarketingMetricGrid,
  MarketingSectionCard,
} from "@/components/marketing/MarketingMetricGrid";
import {
  buildDemoGbpPerformance,
  buildDemoGscDashboard,
  DEMO_GBP_LOCATION,
  DEMO_GSC_SITE,
  DEMO_WEBSITE_ORGANIC_CONVERSIONS,
  OAUTH_DEMO_SCOPES,
  OAUTH_FLOW_STEPS,
} from "@/lib/marketing/oauth-verification-demo-data";
import { GBP_METRIC_LABELS } from "@/lib/google-business/types";

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatPosition(value: number) {
  return value > 0 ? value.toFixed(1) : "—";
}

export function GoogleOAuthVerificationDemo() {
  const gsc = buildDemoGscDashboard();
  const gbp = buildDemoGbpPerformance();
  const connectedAt = format(new Date(), "MMM d, yyyy");

  return (
    <div className="space-y-8">
      <Card className="border-amber-300 bg-amber-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-amber-950">
            <Video className="h-5 w-5" />
            Google OAuth verification preview
          </CardTitle>
          <p className="text-sm text-amber-900">
            Sample data for your YouTube verification video. This page demonstrates how Storm
            Sprinklers CRM uses each OAuth scope after a business owner connects their own Google
            account. No live API calls are made on this page.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="outline" className="border-amber-400 bg-white text-amber-950">
            Preview URL: /marketing/google-oauth-demo
          </Badge>
          <Badge variant="outline" className="border-amber-400 bg-white text-amber-950">
            GSC: {DEMO_GSC_SITE}
          </Badge>
          <Button size="sm" variant="outline" asChild className="bg-white">
            <Link href="/marketing/seo">Live SEO dashboard</Link>
          </Button>
          <Button size="sm" variant="outline" asChild className="bg-white">
            <Link href="/marketing/google-business">Live GBP dashboard</Link>
          </Button>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">OAuth flow (all integrations)</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {OAUTH_FLOW_STEPS.map((item) => (
            <Card key={item.step}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  {item.step}. {item.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{item.detail}</CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Scopes requested by this OAuth client</h2>
        <div className="space-y-4">
          {OAUTH_DEMO_SCOPES.map((entry) => (
            <Card key={entry.id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {entry.product}
                  <Badge variant="secondary">{entry.id}</Badge>
                </CardTitle>
                <code className="text-xs text-muted-foreground">{entry.scope}</code>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>{entry.purpose}</p>
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">APIs used:</span>{" "}
                  {entry.apis.join(", ")}
                </p>
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">Redirect URI:</span>{" "}
                  <code className="text-xs">{entry.redirectPath}</code>
                </p>
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">CRM screen:</span>{" "}
                  <Link href={entry.crmPath} className="text-primary underline">
                    {entry.crmPath}
                  </Link>
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Website traffic and conversions are tracked natively in the CRM (Marketing → SEO → Website
          analytics) and do not require a Google Analytics OAuth scope.
        </p>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Google Business Profile preview</h2>
          <Badge>business.manage</Badge>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Connected · {DEMO_GBP_LOCATION}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Performance data from {gbp.startDate} to {gbp.endDate} · Connected {connectedAt}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <MarketingMetricGrid
              comingSoon={false}
              columns={4}
              metrics={[
                { label: "Total impressions", value: formatCount(gbp.totals.impressions) },
                { label: "Total interactions", value: formatCount(gbp.totals.interactions) },
                { label: "Call clicks", value: formatCount(312) },
                { label: "Website clicks", value: formatCount(428) },
              ]}
            />
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Metric</th>
                    <th className="px-3 py-2 font-medium">Total (30d)</th>
                  </tr>
                </thead>
                <tbody>
                  {gbp.metrics.map((row) => (
                    <tr key={row.metric} className="border-b last:border-b-0">
                      <td className="px-3 py-2">{GBP_METRIC_LABELS[row.metric]}</td>
                      <td className="px-3 py-2 font-medium">{formatCount(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Connect button on the live page redirects to Google OAuth, then loads performance via
              the Business Profile Performance API.
            </p>
            <Button size="sm" variant="outline" asChild>
              <Link href="/api/marketing/google-business">
                <Globe className="mr-2 h-4 w-4" />
                Connect Google Business Profile (live)
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Google Search Console preview</h2>
          <Badge>webmasters.readonly</Badge>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Property: {DEMO_GSC_SITE}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Search analytics from {gsc.overview.startDate} to {gsc.overview.endDate}
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <MarketingMetricGrid
              comingSoon={false}
              columns={6}
              metrics={[
                { label: "Organic clicks", value: formatCount(gsc.overview.clicks) },
                { label: "Search impressions", value: formatCount(gsc.overview.impressions) },
                { label: "Avg. keyword position", value: formatPosition(gsc.overview.position) },
                { label: "Search CTR", value: formatPercent(gsc.overview.ctr) },
                { label: "Pages with impressions", value: formatCount(gsc.overview.pagesWithImpressions) },
                {
                  label: "Organic conversions",
                  value: formatCount(DEMO_WEBSITE_ORGANIC_CONVERSIONS),
                  hint: "Native website tracking",
                },
              ]}
            />
            <MarketingSectionCard title="Top queries" description="From searchanalytics.query API">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Keyword</th>
                      <th className="px-3 py-2 font-medium">Position</th>
                      <th className="px-3 py-2 font-medium">Impressions</th>
                      <th className="px-3 py-2 font-medium">Clicks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gsc.queries.map((row) => (
                      <tr key={row.query} className="border-b last:border-b-0">
                        <td className="px-3 py-2 font-medium">{row.query}</td>
                        <td className="px-3 py-2">{formatPosition(row.position)}</td>
                        <td className="px-3 py-2">{formatCount(row.impressions)}</td>
                        <td className="px-3 py-2">{formatCount(row.clicks)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </MarketingSectionCard>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-5 w-5" />
            Data handling summary for Google reviewers
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Storm Sprinklers CRM is an internal business operations tool for a single irrigation
            company. OAuth connects the business owner&apos;s own Google account to view their
            marketing metrics inside the CRM dashboard.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Read-only scopes only — no write access to Search Console or GBP reporting APIs</li>
            <li>Tokens stored server-side per company; not shared across tenants</li>
            <li>Data displayed only to authenticated CRM admins of that company</li>
            <li>Disconnect removes stored refresh tokens immediately</li>
            <li>No data resale, no advertising use, no sharing with unrelated third parties</li>
            <li>
              Website analytics (page views, UTMs, conversions) are collected first-party and do not
              use Google Analytics OAuth
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
