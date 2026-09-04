"use client";

import { useMemo } from "react";
import type { HolidayStrandMap, HolidayStrandMapFeature } from "@/lib/holiday-lighting/strand-map";

type Mode = "customer" | "installer";

type Props = {
  map: HolidayStrandMap;
  mode: Mode;
  /** Prefer purchase vs lease totals in the legend. */
  priceField?: "purchaseTotal" | "leaseTotal";
  className?: string;
};

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

/** Project lon/lat into an SVG viewBox with padding. */
function projectPaths(features: HolidayStrandMapFeature[]) {
  const points: Array<{ lat: number; lng: number }> = [];
  for (const f of features) {
    for (const path of f.paths) points.push(...path);
    if (f.placement) points.push(f.placement.latLng);
  }
  if (!points.length) {
    return { width: 640, height: 360, project: (_p: { lat: number; lng: number }) => ({ x: 0, y: 0 }), empty: true };
  }

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }

  const pad = 0.00035;
  minLat -= pad;
  maxLat += pad;
  minLng -= pad;
  maxLng += pad;

  const midLat = (minLat + maxLat) / 2;
  const latSpan = Math.max(maxLat - minLat, 0.0002);
  const lngSpan = Math.max(maxLng - minLng, 0.0002);
  const metersPerDegLat = 111_320;
  const metersPerDegLng = 111_320 * Math.cos((midLat * Math.PI) / 180);
  const widthM = lngSpan * metersPerDegLng;
  const heightM = latSpan * metersPerDegLat;
  const aspect = widthM / Math.max(heightM, 1);
  const width = 640;
  const height = Math.max(280, Math.min(480, Math.round(width / aspect)));
  const inset = 24;

  function project(p: { lat: number; lng: number }) {
    const x = inset + ((p.lng - minLng) / lngSpan) * (width - inset * 2);
    const y = inset + ((maxLat - p.lat) / latSpan) * (height - inset * 2);
    return { x, y };
  }

  return { width, height, project, empty: false };
}

function featureSubtitle(feature: HolidayStrandMapFeature, mode: Mode, priceField: "purchaseTotal" | "leaseTotal") {
  const price = money(feature[priceField]);
  if (mode === "installer") {
    if (feature.kind === "placement") {
      return `${feature.lightStyleLabel} · ${price}`;
    }
    return `${feature.lengthFtWithMargin.toFixed(1)} ft (incl. margin) · ${price}`;
  }
  return feature.lightStyleLabel;
}

export function HolidayStrandMapViewer({
  map,
  mode,
  priceField = "purchaseTotal",
  className,
}: Props) {
  const projection = useMemo(() => projectPaths(map.features), [map.features]);

  if (!map.features.length) {
    return (
      <p className="text-sm text-muted-foreground">No strand placements on this quote.</p>
    );
  }

  return (
    <div className={className}>
      <div className="overflow-hidden rounded-lg border border-border bg-[#e8efe8]">
        {projection.empty ? (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            No map geometry
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${projection.width} ${projection.height}`}
            className="h-auto w-full"
            role="img"
            aria-label="Holiday lighting strand map"
          >
            <rect width={projection.width} height={projection.height} fill="#e8efe8" />
            {map.features.map((feature) => (
              <g key={feature.id}>
                {feature.paths.map((path, idx) => {
                  if (path.length < 2) return null;
                  const d = path
                    .map((pt, i) => {
                      const { x, y } = projection.project(pt);
                      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
                    })
                    .join(" ");
                  return (
                    <path
                      key={`${feature.id}-${idx}`}
                      d={d}
                      fill="none"
                      stroke={feature.color}
                      strokeWidth={5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  );
                })}
                {feature.placement ? (
                  (() => {
                    const { x, y } = projection.project(feature.placement.latLng);
                    // ~12–28px circle sized by placement bucket (visual cue, not survey-accurate).
                    const r =
                      feature.placement.radiusMeters < 2.2
                        ? 12
                        : feature.placement.radiusMeters < 3.5
                          ? 16
                          : feature.placement.radiusMeters < 5
                            ? 22
                            : 28;
                    return (
                      <circle
                        cx={x}
                        cy={y}
                        r={r}
                        fill={feature.color}
                        fillOpacity={0.35}
                        stroke={feature.color}
                        strokeWidth={2}
                      />
                    );
                  })()
                ) : null}
              </g>
            ))}
          </svg>
        )}
      </div>

      <ul className="mt-3 space-y-2">
        {map.features.map((feature) => {
          const subtitle = featureSubtitle(feature, mode, priceField);
          return (
          <li
            key={feature.id}
            className="flex items-start gap-3 rounded-md border border-border bg-white px-3 py-2 text-sm"
          >
            <span
              className="mt-1 h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: feature.color }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="font-semibold" style={{ color: feature.color }}>
                {feature.label}
              </p>
              {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
              {mode === "installer" && feature.kind !== "placement" ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Measured {feature.lengthFt.toFixed(1)} ft · margin {map.marginPct}% →{" "}
                  {feature.lengthFtWithMargin.toFixed(1)} ft
                </p>
              ) : null}
            </div>
            {mode === "installer" ? (
              <p className="shrink-0 font-medium">{money(feature[priceField])}</p>
            ) : null}
          </li>
          );
        })}
      </ul>
    </div>
  );
}
