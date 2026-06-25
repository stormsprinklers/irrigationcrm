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

export function GbpLocalRankingPanel() {
  const [settings, setSettings] = useState<LocalSeoSettings | null>(null);
  const [rankings, setRankings] = useState<SerpApiRankingsResponse | null>(null);
  const [selectedKeyword, setSelectedKeyword] = useState("");
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [loadingRankings, setLoadingRankings] = useState(false);
  const [settingsVersion, setSettingsVersion] = useState(0);

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

  const loadRankings = useCallback(async (keyword: string) => {
    if (!keyword) {
      setRankings(null);
      return;
    }

    setLoadingRankings(true);
    try {
      const res = await fetch(
        `/api/marketing/local-seo/rankings?keyword=${encodeURIComponent(keyword)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load rankings");
      setRankings(data as SerpApiRankingsResponse);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load rankings");
      setRankings(null);
    } finally {
      setLoadingRankings(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings, settingsVersion]);

  useEffect(() => {
    if (!selectedKeyword) return;
    void loadRankings(selectedKeyword);
  }, [selectedKeyword, loadRankings, settingsVersion]);

  const hasTargets =
    (settings?.keywords.length ?? 0) > 0 && (settings?.cities.length ?? 0) > 0;

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
              Geographic view of your Google Business Profile rankings by keyword. Data is mocked
              until SerpAPI is connected.
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
              size="icon"
              variant="outline"
              disabled={!selectedKeyword || loadingRankings}
              onClick={() => loadRankings(selectedKeyword)}
            >
              <RefreshCw className={`h-4 w-4 ${loadingRankings ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
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
                {rankings.source === "mock" ? "Sample data" : "Live data"}
              </p>
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
