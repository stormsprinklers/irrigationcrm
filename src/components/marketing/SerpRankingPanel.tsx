"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, MapPinned, RefreshCw, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SerpRankingMap } from "@/components/marketing/SerpRankingMap";
import type { SerpRankingsChannel, SerpRankingsSettings } from "@/lib/local-seo/types";
import type { SerpApiRankingsResponse } from "@/lib/serpapi/types";

type SerpStatus = {
  configured: boolean;
  liveRankingsEnabled: boolean;
  device: "mobile";
  quota: {
    hourlyLimit: number;
    monthlyLimit: number;
    hourlyUsed: number;
    monthlyUsed: number;
    hourlyRemaining: number;
    monthlyRemaining: number;
  };
};

type SerpRankingPanelConfig = {
  channel: SerpRankingsChannel;
  rankingsApiPath: string;
  title: string;
  description: string;
  sourceLabel: string;
  mockSourceLabel: string;
  emptySettingsMessage: string;
  tooltipEntityLabel: string;
};

const GBP_CONFIG: SerpRankingPanelConfig = {
  channel: "GBP",
  rankingsApiPath: "/api/marketing/local-seo/rankings",
  title: "Local ranking map",
  description:
    "Google Business Profile local pack positions by city. Results use mobile Google Local via SerpAPI.",
  sourceLabel: "SerpAPI Google Local (mobile)",
  mockSourceLabel: "Sample data",
  emptySettingsMessage:
    "Add GBP keywords and target locations in Settings → Search rankings to preview the map.",
  tooltipEntityLabel: "listing",
};

const ORGANIC_CONFIG: SerpRankingPanelConfig = {
  channel: "ORGANIC",
  rankingsApiPath: "/api/marketing/organic-seo/rankings",
  title: "Organic ranking map",
  description:
    "Your website's position in Google organic search by city. Results use mobile Google Search via SerpAPI.",
  sourceLabel: "SerpAPI Google Search (mobile)",
  mockSourceLabel: "Sample data",
  emptySettingsMessage:
    "Add organic keywords, your website URL, and target locations in Settings → Search rankings.",
  tooltipEntityLabel: "site",
};

type Props = {
  variant: "gbp" | "organic";
};

function getConfig(variant: Props["variant"]) {
  return variant === "organic" ? ORGANIC_CONFIG : GBP_CONFIG;
}

function getKeywords(settings: SerpRankingsSettings, channel: SerpRankingsChannel) {
  return channel === "ORGANIC" ? settings.organicKeywords : settings.gbpKeywords;
}

export function SerpRankingPanel({ variant }: Props) {
  const config = getConfig(variant);
  const [settings, setSettings] = useState<SerpRankingsSettings | null>(null);
  const [rankings, setRankings] = useState<SerpApiRankingsResponse | null>(null);
  const [serpStatus, setSerpStatus] = useState<SerpStatus | null>(null);
  const [selectedKeyword, setSelectedKeyword] = useState("");
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [loadingRankings, setLoadingRankings] = useState(false);

  const loadSerpStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/marketing/serp/status");
      if (res.ok) setSerpStatus(await res.json());
    } catch {
      /* optional */
    }
  }, []);

  const loadSettings = useCallback(async () => {
    setLoadingSettings(true);
    try {
      const res = await fetch("/api/settings/serp-rankings");
      const data = (await res.json()) as SerpRankingsSettings;
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Failed to load settings");
      setSettings(data);
      const keywords = getKeywords(data, config.channel);
      setSelectedKeyword((current) => current || keywords[0]?.keyword || "");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load search ranking settings");
      setSettings(null);
    } finally {
      setLoadingSettings(false);
    }
  }, [config.channel]);

  const loadRankings = useCallback(
    async (keyword: string, refresh = false) => {
      if (!keyword) {
        setRankings(null);
        return;
      }

      setLoadingRankings(true);
      try {
        const params = new URLSearchParams({ keyword });
        if (refresh) params.set("refresh", "1");

        const res = await fetch(`${config.rankingsApiPath}?${params}`);
        const data = await res.json();

        if (!res.ok && res.status !== 207) {
          throw new Error(data.error ?? "Failed to load rankings");
        }

        setRankings(data as SerpApiRankingsResponse);
        await loadSerpStatus();

        if (data.quota?.message) {
          toast.message(data.quota.message);
        } else if (refresh && data.quota?.searchesThisRequest) {
          toast.success(
            `Refreshed ${data.quota.searchesThisRequest} location ranking${data.quota.searchesThisRequest === 1 ? "" : "s"} from SerpAPI`
          );
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load rankings");
        setRankings(null);
      } finally {
        setLoadingRankings(false);
      }
    },
    [config.rankingsApiPath, loadSerpStatus]
  );

  useEffect(() => {
    void loadSettings();
    void loadSerpStatus();
  }, [loadSettings, loadSerpStatus]);

  useEffect(() => {
    if (!selectedKeyword) return;
    void loadRankings(selectedKeyword, false);
  }, [selectedKeyword, loadRankings]);

  const keywords = settings ? getKeywords(settings, config.channel) : [];
  const hasTargets = keywords.length > 0 && (settings?.cities.length ?? 0) > 0;
  const hasWebsite =
    config.channel === "GBP" || Boolean(settings?.organicSearchWebsiteUrl?.trim());

  const cityCount = settings?.cities.length ?? 0;
  const usingLiveData = serpStatus?.configured ?? false;
  const remainingHourly = serpStatus?.quota.hourlyRemaining ?? 0;
  const remainingMonthly = serpStatus?.quota.monthlyRemaining ?? 0;
  const refreshBlocked =
    usingLiveData && (remainingHourly === 0 || remainingMonthly === 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPinned className="h-5 w-5" />
            {config.title}
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {usingLiveData
              ? config.description
              : "Sample rankings until SERPAPI_API_KEY is configured."}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button size="sm" variant="ghost" asChild>
            <Link href="/settings/integrations/serp-rankings">
              <Settings2 className="mr-1 h-4 w-4" />
              Settings
            </Link>
          </Button>
          {keywords.length ? (
            <select
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={selectedKeyword}
              onChange={(event) => setSelectedKeyword(event.target.value)}
            >
              {keywords.map((keyword) => (
                <option key={keyword.id} value={keyword.keyword}>
                  {keyword.keyword}
                </option>
              ))}
            </select>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            disabled={!selectedKeyword || loadingRankings || refreshBlocked || !hasWebsite}
            onClick={() => loadRankings(selectedKeyword, true)}
            title={
              refreshBlocked
                ? "SerpAPI quota exhausted"
                : usingLiveData
                  ? `Uses up to ${Math.min(cityCount, remainingHourly, remainingMonthly)} SerpAPI searches`
                  : "Refresh sample rankings"
            }
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${loadingRankings ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {usingLiveData && serpStatus ? (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            <p className="font-medium">SerpAPI usage (mobile · free plan protection)</p>
            <p className="mt-1">
              Hourly: {serpStatus.quota.hourlyUsed}/{serpStatus.quota.hourlyLimit} used ·{" "}
              {serpStatus.quota.hourlyRemaining} remaining
            </p>
            <p>
              Monthly: {serpStatus.quota.monthlyUsed}/{serpStatus.quota.monthlyLimit} used ·{" "}
              {serpStatus.quota.monthlyRemaining} remaining
            </p>
            <p className="mt-1 text-amber-900">
              Refresh checks up to {cityCount} locations (1 search each). Cached locations within 24h
              are skipped.
            </p>
          </div>
        ) : null}

        {loadingSettings ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading map...
          </div>
        ) : !hasTargets || !hasWebsite ? (
          <p className="text-sm text-muted-foreground">{config.emptySettingsMessage}</p>
        ) : loadingRankings && !rankings ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading rankings...
          </div>
        ) : rankings ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Tracking <span className="font-medium text-foreground">{rankings.businessName}</span>{" "}
              for &ldquo;{rankings.keyword}&rdquo; ·{" "}
              {rankings.source === "mock" ? config.mockSourceLabel : config.sourceLabel}
            </p>
            {rankings.cacheStatus === "cache_only" &&
            rankings.cities.some((city) => city.topBusinesses.length === 0) ? (
              <p className="text-sm text-muted-foreground">
                No cached rankings yet. Click <strong>Refresh</strong> to fetch live results
                {usingLiveData
                  ? ` (up to ${Math.min(cityCount, remainingHourly, remainingMonthly)} SerpAPI searches).`
                  : "."}
              </p>
            ) : null}
            <SerpRankingMap
              rankings={rankings.cities}
              trackedName={rankings.businessName}
              lastSearchedAt={
                rankings.source === "serpapi" &&
                rankings.cities.some((city) => city.topBusinesses.length > 0)
                  ? rankings.updatedAt
                  : null
              }
            />
            <p className="text-xs text-muted-foreground">
              Hover a dot to see the top 3 results. If your {config.tooltipEntityLabel} ranks outside
              the top 3, it appears below with its rank.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No ranking data available.</p>
        )}
      </CardContent>
    </Card>
  );
}
