"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, MapPinned, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GbpLocalRankingMap } from "@/components/marketing/GbpLocalRankingMap";
import { GbpLocalSeoSettings } from "@/components/marketing/GbpLocalSeoSettings";
import type { LocalSeoSettings } from "@/lib/local-seo/types";
import type { SerpApiRankingsResponse } from "@/lib/serpapi/types";

type SerpStatus = {
  configured: boolean;
  liveRankingsEnabled: boolean;
  quota: {
    hourlyLimit: number;
    monthlyLimit: number;
    hourlyUsed: number;
    monthlyUsed: number;
    hourlyRemaining: number;
    monthlyRemaining: number;
  };
};

export function GbpLocalRankingPanel() {
  const [settings, setSettings] = useState<LocalSeoSettings | null>(null);
  const [rankings, setRankings] = useState<SerpApiRankingsResponse | null>(null);
  const [serpStatus, setSerpStatus] = useState<SerpStatus | null>(null);
  const [selectedKeyword, setSelectedKeyword] = useState("");
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [loadingRankings, setLoadingRankings] = useState(false);
  const [settingsVersion, setSettingsVersion] = useState(0);

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
      const res = await fetch("/api/marketing/local-seo/settings");
      const data = (await res.json()) as LocalSeoSettings;
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Failed to load settings");
      setSettings(data);
      setSelectedKeyword((current) => current || data.keywords[0]?.keyword || "");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load local SEO settings");
      setSettings(null);
    } finally {
      setLoadingSettings(false);
    }
  }, []);

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

        const res = await fetch(`/api/marketing/local-seo/rankings?${params}`);
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
            `Refreshed ${data.quota.searchesThisRequest} city ranking${data.quota.searchesThisRequest === 1 ? "" : "s"} from SerpAPI`
          );
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load rankings");
        setRankings(null);
      } finally {
        setLoadingRankings(false);
      }
    },
    [loadSerpStatus]
  );

  useEffect(() => {
    void loadSettings();
    void loadSerpStatus();
  }, [loadSettings, loadSerpStatus, settingsVersion]);

  useEffect(() => {
    if (!selectedKeyword) return;
    void loadRankings(selectedKeyword, false);
  }, [selectedKeyword, loadRankings, settingsVersion]);

  const hasTargets =
    (settings?.keywords.length ?? 0) > 0 && (settings?.cities.length ?? 0) > 0;

  const cityCount = settings?.cities.length ?? 0;
  const usingLiveData = serpStatus?.configured ?? false;
  const remainingHourly = serpStatus?.quota.hourlyRemaining ?? 0;
  const remainingMonthly = serpStatus?.quota.monthlyRemaining ?? 0;
  const refreshBlocked =
    usingLiveData && (remainingHourly === 0 || remainingMonthly === 0);

  return (
    <div className="space-y-6">
      <GbpLocalSeoSettings onSaved={() => setSettingsVersion((value) => value + 1)} />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPinned className="h-5 w-5" />
              Local ranking map
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {usingLiveData
                ? "Live Google Local rankings via SerpAPI. Cached results load instantly; refresh fetches new data."
                : "Sample rankings until SERPAPI_API_KEY is configured."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {settings?.keywords.length ? (
              <select
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                value={selectedKeyword}
                onChange={(event) => setSelectedKeyword(event.target.value)}
              >
                {settings.keywords.map((keyword) => (
                  <option key={keyword.id} value={keyword.keyword}>
                    {keyword.keyword}
                  </option>
                ))}
              </select>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              disabled={!selectedKeyword || loadingRankings || refreshBlocked}
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
              <p className="font-medium">SerpAPI usage (free plan protection)</p>
              <p className="mt-1">
                Hourly: {serpStatus.quota.hourlyUsed}/{serpStatus.quota.hourlyLimit} used ·{" "}
                {serpStatus.quota.hourlyRemaining} remaining
              </p>
              <p>
                Monthly: {serpStatus.quota.monthlyUsed}/{serpStatus.quota.monthlyLimit} used ·{" "}
                {serpStatus.quota.monthlyRemaining} remaining
              </p>
              <p className="mt-1 text-amber-900">
                Refresh checks up to {cityCount} cities (1 search each). Cached cities within 24h
                are skipped.
              </p>
            </div>
          ) : null}

          {loadingSettings ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading map...
            </div>
          ) : !hasTargets ? (
            <p className="text-sm text-muted-foreground">
              Add at least one keyword and one target city above to preview the ranking map.
            </p>
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
                {rankings.source === "mock" ? "Sample data" : "SerpAPI Google Local"}
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
              <GbpLocalRankingMap rankings={rankings.cities} businessName={rankings.businessName} />
              <p className="text-xs text-muted-foreground">
                Hover a dot to see the top 3 businesses. If you rank outside the top 3, your listing
                appears below with its rank.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No ranking data available.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
