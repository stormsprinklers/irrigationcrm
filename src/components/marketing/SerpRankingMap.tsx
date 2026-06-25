"use client";

import { useEffect, useRef } from "react";
import type { SerpApiCityRanking } from "@/lib/serpapi/types";
import {
  formatRankLabel,
  getRankingTier,
  RANKING_TIER_COLORS,
  RANKING_TIER_LABELS,
} from "@/lib/local-seo/ranking-colors";
import { buildRankingTooltipHtml } from "@/lib/local-seo/tooltip";

type Props = {
  rankings: SerpApiCityRanking[];
  trackedName: string;
};

export function SerpRankingMap({ rankings, trackedName }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || rankings.length === 0) return;

    let disposed = false;

    void import("leaflet").then((leafletModule) => {
      if (disposed || !containerRef.current) return;

      const L = leafletModule.default;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const map = L.map(containerRef.current, {
        scrollWheelZoom: true,
      });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      const bounds = L.latLngBounds(rankings.map((ranking) => [ranking.latitude, ranking.longitude]));
      map.fitBounds(bounds.pad(0.18));

      for (const ranking of rankings) {
        const tier = getRankingTier(ranking.ourRank);
        const color = RANKING_TIER_COLORS[tier];
        const label = formatRankLabel(ranking.ourRank);

        const icon = L.divIcon({
          className: "gbp-rank-marker-icon",
          html: `<div class="gbp-rank-marker" style="background:${color}">${label}</div>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });

        L.marker([ranking.latitude, ranking.longitude], { icon })
          .addTo(map)
          .bindTooltip(buildRankingTooltipHtml(ranking, trackedName), {
            direction: "top",
            sticky: true,
            opacity: 1,
            className: "gbp-map-tooltip",
          });
      }
    });

    return () => {
      disposed = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [rankings, trackedName]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {(["top3", "mid", "low", "none"] as const).map((tier) => (
          <span key={tier} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: RANKING_TIER_COLORS[tier] }}
            />
            {RANKING_TIER_LABELS[tier]}
          </span>
        ))}
      </div>
      <div ref={containerRef} className="h-[520px] w-full overflow-hidden rounded-lg border border-border" />
    </div>
  );
}
