"use client";

import { useCallback, useRef, useState } from "react";
import { Check, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ZONE_MAP_COLORS } from "@/lib/irrigation/constants";
import {
  polygonCentroid,
  polygonToSvgPoints,
  type ImagePolygon,
} from "@/lib/irrigation/image-polygon";

export type ZoneMapEntry = {
  name: string;
  polygon: ImagePolygon | null;
  color?: string;
};

type Props = {
  imageUrl: string;
  zones: ZoneMapEntry[];
  activeZoneIndex: number;
  onActiveZoneChange: (index: number) => void;
  onZonePolygonChange: (index: number, polygon: ImagePolygon | null) => void;
  readOnly?: boolean;
};

export function AerialZoneMapEditor({
  imageUrl,
  zones,
  activeZoneIndex,
  onActiveZoneChange,
  onZonePolygonChange,
  readOnly = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draftPoints, setDraftPoints] = useState<ImagePolygon>([]);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const measure = useCallback(() => {
    const img = containerRef.current?.querySelector("img");
    if (!img) return;
    setSize({ width: img.clientWidth, height: img.clientHeight });
  }, []);

  function toNormalized(clientX: number, clientY: number): [number, number] | null {
    const img = containerRef.current?.querySelector("img");
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000];
  }

  function handleImageClick(e: React.MouseEvent) {
    if (readOnly) return;
    const point = toNormalized(e.clientX, e.clientY);
    if (!point) return;
    setDraftPoints((prev) => [...prev, point]);
  }

  function completePolygon() {
    if (draftPoints.length < 3) return;
    onZonePolygonChange(activeZoneIndex, draftPoints);
    setDraftPoints([]);
  }

  function clearActivePolygon() {
    onZonePolygonChange(activeZoneIndex, null);
    setDraftPoints([]);
  }

  const activeZone = zones[activeZoneIndex];

  return (
    <div className="space-y-3">
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          {zones.map((zone, index) => {
            const color = zone.color ?? ZONE_MAP_COLORS[index % ZONE_MAP_COLORS.length];
            const hasPolygon = Boolean(zone.polygon?.length);
            return (
              <Button
                key={zone.name}
                type="button"
                size="sm"
                variant={index === activeZoneIndex ? "default" : "outline"}
                onClick={() => {
                  onActiveZoneChange(index);
                  setDraftPoints([]);
                }}
                className="gap-2"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
                {zone.name}
                {hasPolygon ? <Check className="h-3 w-3 opacity-70" /> : null}
              </Button>
            );
          })}
        </div>
      )}

      {!readOnly && (
        <p className="text-xs text-muted-foreground">
          Select a zone, then click on the image to place corners. Use at least 3 points and
          click &quot;Complete zone&quot; when finished.
        </p>
      )}

      <div
        ref={containerRef}
        className={cn(
          "relative inline-block max-w-full overflow-hidden rounded-md border bg-muted/20",
          !readOnly && "cursor-crosshair"
        )}
        onClick={handleImageClick}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt="Property aerial"
          className="block max-h-[28rem] w-full object-contain"
          onLoad={measure}
        />
        {size.width > 0 && size.height > 0 && (
          <svg
            className="pointer-events-none absolute left-0 top-0"
            width={size.width}
            height={size.height}
            viewBox={`0 0 ${size.width} ${size.height}`}
          >
            {zones.map((zone, index) => {
              if (!zone.polygon?.length) return null;
              const color = zone.color ?? ZONE_MAP_COLORS[index % ZONE_MAP_COLORS.length];
              const [cx, cy] = polygonCentroid(zone.polygon);
              return (
                <g key={zone.name}>
                  <polygon
                    points={polygonToSvgPoints(zone.polygon, size.width, size.height)}
                    fill={color}
                    fillOpacity={index === activeZoneIndex ? 0.45 : 0.3}
                    stroke={color}
                    strokeWidth={2}
                  />
                  <text
                    x={cx * size.width}
                    y={cy * size.height}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="fill-white text-[11px] font-semibold"
                    style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.55)", strokeWidth: 3 }}
                  >
                    {zone.name}
                  </text>
                </g>
              );
            })}
            {!readOnly && draftPoints.length > 0 && (
              <>
                <polyline
                  points={polygonToSvgPoints(draftPoints, size.width, size.height)}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                />
                {draftPoints.map(([x, y], i) => (
                  <circle
                    key={i}
                    cx={x * size.width}
                    cy={y * size.height}
                    r={4}
                    fill="#ffffff"
                    stroke="#111827"
                    strokeWidth={1.5}
                  />
                ))}
              </>
            )}
          </svg>
        )}
      </div>

      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={draftPoints.length < 3}
            onClick={completePolygon}
          >
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Complete {activeZone?.name ?? "zone"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setDraftPoints([])}
            disabled={!draftPoints.length}
          >
            Undo points
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={clearActivePolygon}
            disabled={!activeZone?.polygon?.length && !draftPoints.length}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Clear {activeZone?.name ?? "zone"}
          </Button>
        </div>
      )}
    </div>
  );
}
