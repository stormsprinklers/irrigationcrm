"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, MapPin, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { LocalSeoSettings, LocalSeoTargetCityRecord } from "@/lib/local-seo/types";
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

type Props = {
  onSaved?: () => void;
};

export function GbpLocalSeoSettings({ onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [cities, setCities] = useState<DraftCity[]>([]);
  const [newKeyword, setNewKeyword] = useState("");
  const [cityQuery, setCityQuery] = useState("");
  const [cityResults, setCityResults] = useState<SerpApiLocation[]>([]);
  const [searchingCities, setSearchingCities] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/marketing/local-seo/settings");
      const data = (await res.json()) as LocalSeoSettings;
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Failed to load settings");
      setKeywords(data.keywords.map((keyword) => keyword.keyword));
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
      toast.error(err instanceof Error ? err.message : "Failed to load local SEO settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!cityQuery.trim()) {
      setCityResults([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      setSearchingCities(true);
      try {
        const res = await fetch(
          `/api/marketing/local-seo/locations/search?q=${encodeURIComponent(cityQuery.trim())}`
        );
        const data = await res.json();
        if (res.ok) setCityResults(data.locations ?? []);
      } finally {
        setSearchingCities(false);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [cityQuery]);

  const cityKeys = useMemo(
    () => new Set(cities.map((city) => city.canonicalName.toLowerCase())),
    [cities]
  );

  function addKeyword() {
    const value = newKeyword.trim();
    if (!value) return;
    if (keywords.some((keyword) => keyword.toLowerCase() === value.toLowerCase())) {
      toast.error("Keyword already added");
      return;
    }
    setKeywords((current) => [...current, value]);
    setNewKeyword("");
  }

  function removeKeyword(keyword: string) {
    setKeywords((current) => current.filter((item) => item !== keyword));
  }

  function addCity(location: SerpApiLocation) {
    const draft = locationToDraft(location);
    if (cityKeys.has(draft.canonicalName.toLowerCase())) {
      toast.error("City already added");
      return;
    }
    setCities((current) => [...current, draft]);
    setCityQuery("");
    setCityResults([]);
  }

  function removeCity(canonicalName: string) {
    setCities((current) => current.filter((city) => city.canonicalName !== canonicalName));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/marketing/local-seo/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords,
          cities: cities.map((city, index) => draftToCityRecord(city, index)),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save settings");
      toast.success("Local SEO settings saved");
      await load();
      onSaved?.();
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
        Loading local SEO settings...
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Local ranking targets</CardTitle>
        <p className="text-sm text-muted-foreground">
          Choose keywords and cities to track on the map. City search uses sample Utah locations for
          now; SerpAPI location search will replace this in the next step.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <label className="text-sm font-medium">Keywords / search terms</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {keywords.map((keyword) => (
              <Badge key={keyword} variant="secondary" className="gap-1 pr-1">
                {keyword}
                <button
                  type="button"
                  className="rounded-full p-0.5 hover:bg-muted"
                  onClick={() => removeKeyword(keyword)}
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
              onChange={(event) => setNewKeyword(event.target.value)}
              placeholder='e.g. "sprinkler repair"'
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addKeyword();
                }
              }}
            />
            <Button type="button" variant="outline" onClick={addKeyword}>
              <Plus className="mr-1 h-4 w-4" />
              Add
            </Button>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Target cities</label>
          <div className="mt-2 space-y-2">
            {cities.map((city) => (
              <div
                key={city.canonicalName}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="font-medium">{city.name}</p>
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
              <p className="text-sm text-muted-foreground">No cities selected yet</p>
            ) : null}
          </div>

          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              value={cityQuery}
              onChange={(event) => setCityQuery(event.target.value)}
              placeholder="Search cities (e.g. Draper, Sandy)"
            />
          </div>
          {searchingCities ? (
            <p className="mt-2 text-xs text-muted-foreground">Searching...</p>
          ) : null}
          {cityResults.length > 0 ? (
            <div className="mt-2 overflow-hidden rounded-md border">
              {cityResults.map((location) => (
                <button
                  key={location.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted/40"
                  onClick={() => addCity(location)}
                >
                  <span>
                    <span className="font-medium">{location.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {location.canonical_name}
                    </span>
                  </span>
                  <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <Button type="button" onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save targets"}
        </Button>
      </CardContent>
    </Card>
  );
}
