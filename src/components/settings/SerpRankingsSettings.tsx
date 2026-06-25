"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, MapPin, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { LocalSeoTargetCityRecord, SerpRankingsSettings } from "@/lib/local-seo/types";
import type { SerpApiLocation } from "@/lib/serpapi/types";

type DraftCity = {
  serpApiId: string | null;
  googleId: number | null;
  name: string;
  canonicalName: string;
  countryCode: string;
  targetType: string;
  latitude: number;
  longitude: number;
};

function locationToDraft(location: SerpApiLocation): DraftCity {
  return {
    serpApiId: location.id,
    googleId: location.google_id ?? null,
    name: location.name,
    canonicalName: location.canonical_name,
    countryCode: location.country_code,
    targetType: location.target_type,
    latitude: location.gps[1],
    longitude: location.gps[0],
  };
}

function draftToCityRecord(city: DraftCity, index: number): Omit<LocalSeoTargetCityRecord, "id"> {
  return {
    serpApiId: city.serpApiId,
    googleId: city.googleId,
    name: city.name,
    canonicalName: city.canonicalName,
    countryCode: city.countryCode,
    targetType: city.targetType,
    latitude: city.latitude,
    longitude: city.longitude,
    sortOrder: index,
  };
}

function formatLocationTitle(city: DraftCity) {
  return city.targetType === "Postal Code" ? `ZIP ${city.name}` : city.name;
}

function locationTypeLabel(targetType: string) {
  return targetType === "Postal Code" ? "ZIP" : "City";
}

type KeywordSectionProps = {
  title: string;
  description: string;
  keywords: string[];
  newKeyword: string;
  onNewKeywordChange: (value: string) => void;
  onAdd: () => void;
  onRemove: (keyword: string) => void;
  placeholder: string;
};

function KeywordSection({
  title,
  description,
  keywords,
  newKeyword,
  onNewKeywordChange,
  onAdd,
  onRemove,
  placeholder,
}: KeywordSectionProps) {
  return (
    <div>
      <label className="text-sm font-medium">{title}</label>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {keywords.map((keyword) => (
          <Badge key={keyword} variant="secondary" className="gap-1 pr-1">
            {keyword}
            <button
              type="button"
              className="rounded-full p-0.5 hover:bg-muted"
              onClick={() => onRemove(keyword)}
              aria-label={`Remove ${keyword}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        {keywords.length === 0 ? (
          <span className="text-sm text-muted-foreground">No keywords yet</span>
        ) : null}
      </div>
      <div className="mt-2 flex gap-2">
        <Input
          value={newKeyword}
          onChange={(event) => onNewKeywordChange(event.target.value)}
          placeholder={placeholder}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onAdd();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={onAdd}>
          <Plus className="mr-1 h-4 w-4" />
          Add
        </Button>
      </div>
    </div>
  );
}

export function SerpRankingsSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gbpKeywords, setGbpKeywords] = useState<string[]>([]);
  const [organicKeywords, setOrganicKeywords] = useState<string[]>([]);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [cities, setCities] = useState<DraftCity[]>([]);
  const [newGbpKeyword, setNewGbpKeyword] = useState("");
  const [newOrganicKeyword, setNewOrganicKeyword] = useState("");
  const [cityQuery, setCityQuery] = useState("");
  const [cityResults, setCityResults] = useState<SerpApiLocation[]>([]);
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [locationStats, setLocationStats] = useState<{
    total: number;
    cities: number;
    postalCodes: number;
  } | null>(null);
  const [searchingCities, setSearchingCities] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/serp-rankings");
      const data = (await res.json()) as SerpRankingsSettings;
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Failed to load settings");
      setGbpKeywords(data.gbpKeywords.map((keyword) => keyword.keyword));
      setOrganicKeywords(data.organicKeywords.map((keyword) => keyword.keyword));
      setWebsiteUrl(data.organicSearchWebsiteUrl ?? "");
      setCities(
        data.cities.map((city) => ({
          serpApiId: city.serpApiId,
          googleId: city.googleId,
          name: city.name,
          canonicalName: city.canonicalName,
          countryCode: city.countryCode,
          targetType: city.targetType,
          latitude: city.latitude,
          longitude: city.longitude,
        }))
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load search ranking settings");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCityResults = useCallback(async (query: string) => {
    setSearchingCities(true);
    try {
      const params = new URLSearchParams({ limit: "500" });
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/marketing/local-seo/locations/search?${params}`);
      const data = await res.json();
      if (res.ok) {
        setCityResults(data.locations ?? []);
        if (typeof data.totalUtahLocations === "number") {
          setLocationStats({
            total: data.totalUtahLocations,
            cities: data.totalUtahCities ?? 0,
            postalCodes: data.totalUtahPostalCodes ?? 0,
          });
        }
      }
    } finally {
      setSearchingCities(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!cityPickerOpen) return;

    const timer = window.setTimeout(
      () => {
        void loadCityResults(cityQuery);
      },
      cityQuery.trim() ? 250 : 0
    );

    return () => window.clearTimeout(timer);
  }, [cityQuery, cityPickerOpen, loadCityResults]);

  const cityKeys = useMemo(
    () => new Set(cities.map((city) => city.canonicalName.toLowerCase())),
    [cities]
  );

  function addKeyword(
    value: string,
    keywords: string[],
    setKeywords: (next: string[]) => void,
    clearInput: () => void
  ) {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (keywords.some((keyword) => keyword.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("Keyword already added");
      return;
    }
    setKeywords([...keywords, trimmed]);
    clearInput();
  }

  function addCity(location: SerpApiLocation) {
    const draft = locationToDraft(location);
    if (cityKeys.has(draft.canonicalName.toLowerCase())) {
      toast.error("Location already added");
      return;
    }
    setCities((current) => [...current, draft]);
    setCityQuery("");
    setCityResults([]);
    setCityPickerOpen(false);
  }

  function removeCity(canonicalName: string) {
    setCities((current) => current.filter((city) => city.canonicalName !== canonicalName));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/serp-rankings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gbpKeywords,
          organicKeywords,
          organicSearchWebsiteUrl: websiteUrl,
          cities: cities.map((city, index) => draftToCityRecord(city, index)),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save settings");
      toast.success("Search ranking settings saved");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading search ranking settings...
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Search ranking targets</CardTitle>
        <p className="text-sm text-muted-foreground">
          Configure keywords and Utah locations for Google Business Profile local pack and organic
          website rankings. All SerpAPI searches use mobile results.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <label className="text-sm font-medium">Website URL (organic SEO)</label>
          <p className="mt-1 text-xs text-muted-foreground">
            Used to find your site in Google organic search results on the SEO map.
          </p>
          <Input
            className="mt-2"
            value={websiteUrl}
            onChange={(event) => setWebsiteUrl(event.target.value)}
            placeholder="https://www.example.com"
          />
        </div>

        <KeywordSection
          title="GBP keywords"
          description="Tracked on Marketing → Google Business Profile."
          keywords={gbpKeywords}
          newKeyword={newGbpKeyword}
          onNewKeywordChange={setNewGbpKeyword}
          onAdd={() =>
            addKeyword(newGbpKeyword, gbpKeywords, setGbpKeywords, () => setNewGbpKeyword(""))
          }
          onRemove={(keyword) => setGbpKeywords((current) => current.filter((item) => item !== keyword))}
          placeholder='e.g. "sprinkler repair"'
        />

        <KeywordSection
          title="Organic keywords"
          description="Tracked on Marketing → SEO."
          keywords={organicKeywords}
          newKeyword={newOrganicKeyword}
          onNewKeywordChange={setNewOrganicKeyword}
          onAdd={() =>
            addKeyword(
              newOrganicKeyword,
              organicKeywords,
              setOrganicKeywords,
              () => setNewOrganicKeyword("")
            )
          }
          onRemove={(keyword) =>
            setOrganicKeywords((current) => current.filter((item) => item !== keyword))
          }
          placeholder='e.g. "sprinkler installation utah"'
        />

        <div>
          <label className="text-sm font-medium">Target cities & ZIP codes</label>
          <p className="mt-1 text-xs text-muted-foreground">
            Shared by both GBP and organic maps. The catalog includes{" "}
            {locationStats
              ? `${locationStats.cities} cities and ${locationStats.postalCodes} ZIP codes`
              : "159 cities and 296 ZIP codes"}{" "}
            from SerpAPI.
          </p>
          <div className="mt-2 space-y-2">
            {cities.map((city) => (
              <div
                key={city.canonicalName}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{formatLocationTitle(city)}</p>
                    <Badge variant="outline" className="text-[10px]">
                      {locationTypeLabel(city.targetType)}
                    </Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{city.canonicalName}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => removeCity(city.canonicalName)}
                >
                  Remove
                </Button>
              </div>
            ))}
            {cities.length === 0 ? (
              <p className="text-sm text-muted-foreground">No locations selected yet</p>
            ) : null}
          </div>

          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              value={cityQuery}
              onChange={(event) => setCityQuery(event.target.value)}
              onFocus={() => setCityPickerOpen(true)}
              placeholder="Search Utah cities or ZIP codes (e.g. Draper, 84020)"
            />
          </div>
          {cityPickerOpen && searchingCities ? (
            <p className="mt-2 text-xs text-muted-foreground">Loading locations...</p>
          ) : null}
          {cityPickerOpen && cityResults.length > 0 ? (
            <div className="mt-2 overflow-hidden rounded-md border">
              <p className="border-b bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                {cityQuery.trim()
                  ? `${cityResults.length} matching locations`
                  : `Showing ${cityResults.length} of ${locationStats?.total ?? cityResults.length} Utah locations`}
              </p>
              <div className="max-h-64 overflow-y-auto">
                {cityResults.map((location) => (
                  <button
                    key={location.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted/40"
                    onClick={() => addCity(location)}
                  >
                    <span>
                      <span className="flex items-center gap-2">
                        <span className="font-medium">
                          {location.target_type === "Postal Code"
                            ? `ZIP ${location.name}`
                            : location.name}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          {locationTypeLabel(location.target_type)}
                        </Badge>
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {location.canonical_name}
                      </span>
                    </span>
                    <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <Button type="button" onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save settings"}
        </Button>
      </CardContent>
    </Card>
  );
}
