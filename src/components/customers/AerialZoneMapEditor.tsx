"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  IRRIGATION_MAP_MARKER_KINDS,
  MAP_MARKER_STYLES,
  ZONE_MAP_COLORS,
  type IrrigationMapMarkerKind,
} from "@/lib/irrigation/constants";
import {
  computeCroppedMapLayout,
  computeMapFocusBounds,
  polygonCentroid,
  polygonToSvgPoints,
  type ImagePoint,
  type ImagePolygon,
} from "@/lib/irrigation/image-polygon";

export type ZoneMapEntry = {
  name: string;
  polygon: ImagePolygon | null;
  color?: string;
};

export type MapMarkerEntry = {
  id: string;
  type: IrrigationMapMarkerKind;
  label: string;
  point: ImagePoint | null;
};

type Props = {
  imageUrl: string;
  zones: ZoneMapEntry[];
  activeZoneIndex: number;
  onActiveZoneChange: (index: number) => void;
  onZonePolygonChange: (index: number, polygon: ImagePolygon | null) => void;
  readOnly?: boolean;
  focusOnZones?: boolean;
  markers?: MapMarkerEntry[];
  markerPlacement?: IrrigationMapMarkerKind | null;
  onMarkerPlace?: (type: IrrigationMapMarkerKind, point: ImagePoint) => void;
  onMarkerRemove?: (id: string) => void;
  onZoneRename?: (index: number, name: string) => void;
  onZoneAdd?: () => void;
  onZoneRemove?: (index: number) => void;
};

const MAX_MAP_HEIGHT_PX = 448;

export function AerialZoneMapEditor({
  imageUrl,
  zones,
  activeZoneIndex,
  onActiveZoneChange,
  onZonePolygonChange,
  readOnly = false,
  focusOnZones = readOnly,
  markers = [],
  markerPlacement = null,
  onMarkerPlace,
  onMarkerRemove,
  onZoneRename,
  onZoneAdd,
  onZoneRemove,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const [draftPoints, setDraftPoints] = useState<ImagePolygon>([]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [containerWidth, setContainerWidth] = useState(0);

  const cropBounds = useMemo(() => {
    if (!focusOnZones) return null;
    return computeMapFocusBounds(
      zones.map((zone) => zone.polygon),
      markers.map((marker) => marker.point)
    );
  }, [focusOnZones, zones, markers]);

  const croppedLayout = useMemo(() => {
    if (!cropBounds) return null;
    return computeCroppedMapLayout(
      cropBounds,
      naturalSize.width,
      naturalSize.height,
      containerWidth,
      MAX_MAP_HEIGHT_PX
    );
  }, [cropBounds, naturalSize, containerWidth]);

  const measure = useCallback(() => {
    const img = containerRef.current?.querySelector("img");
    if (!img) return;
    setSize({ width: img.clientWidth, height: img.clientHeight });
    if (img.naturalWidth && img.naturalHeight) {
      setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
    }
  }, []);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setContainerWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!croppedLayout) return;
    setSize({ width: croppedLayout.innerWidth, height: croppedLayout.innerHeight });
  }, [croppedLayout]);

  function toNormalized(clientX: number, clientY: number): ImagePoint | null {
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

    if (markerPlacement && onMarkerPlace) {
      onMarkerPlace(markerPlacement, point);
      return;
    }

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
  const displayWidth = croppedLayout?.innerWidth ?? size.width;
  const displayHeight = croppedLayout?.innerHeight ?? size.height;
  const useCrop = Boolean(croppedLayout);
  const placingMarker = Boolean(markerPlacement);

  const mapViewport = (
    <div
      ref={containerRef}
      className={cn(
        "relative",
        !useCrop && "inline-block max-w-full",
        !readOnly && !useCrop && (placingMarker ? "cursor-pointer" : "cursor-crosshair")
      )}
      style={
        useCrop
          ? {
              width: croppedLayout!.innerWidth,
              height: croppedLayout!.innerHeight,
              left:
                croppedLayout!.offsetLeft +
                Math.max(0, (containerWidth - croppedLayout!.outerWidth) / 2),
              top: croppedLayout!.offsetTop,
              position: "absolute",
            }
          : undefined
      }
      onClick={handleImageClick}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt="Property aerial"
        className={cn(
          "block",
          useCrop ? "h-full w-full object-fill" : "max-h-[28rem] w-full object-contain"
        )}
        onLoad={measure}
      />
      {displayWidth > 0 && displayHeight > 0 && (
        <svg
          className="pointer-events-none absolute left-0 top-0"
          width={displayWidth}
          height={displayHeight}
          viewBox={`0 0 ${displayWidth} ${displayHeight}`}
        >
          {zones.map((zone, index) => {
            if (!zone.polygon?.length) return null;
            const color = zone.color ?? ZONE_MAP_COLORS[index % ZONE_MAP_COLORS.length];
            const [cx, cy] = polygonCentroid(zone.polygon);
            return (
              <g key={`${zone.name}-${index}`}>
                <polygon
                  points={polygonToSvgPoints(zone.polygon, displayWidth, displayHeight)}
                  fill={color}
                  fillOpacity={index === activeZoneIndex ? 0.45 : 0.3}
                  stroke={color}
                  strokeWidth={2}
                />
                <text
                  x={cx * displayWidth}
                  y={cy * displayHeight}
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
          {markers.map((marker) => {
            if (!marker.point) return null;
            const style = MAP_MARKER_STYLES[marker.type];
            const [x, y] = marker.point;
            return (
              <g key={marker.id}>
                <circle
                  cx={x * displayWidth}
                  cy={y * displayHeight}
                  r={10}
                  fill={style.color}
                  stroke="#fff"
                  strokeWidth={2}
                />
                <text
                  x={x * displayWidth}
                  y={y * displayHeight}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-white text-[9px] font-bold"
                >
                  {style.short}
                </text>
              </g>
            );
          })}
          {!readOnly && draftPoints.length > 0 && (
            <>
              <polyline
                points={polygonToSvgPoints(draftPoints, displayWidth, displayHeight)}
                fill="none"
                stroke="#ffffff"
                strokeWidth={2}
                strokeDasharray="4 4"
              />
              {draftPoints.map(([x, y], i) => (
                <circle
                  key={i}
                  cx={x * displayWidth}
                  cy={y * displayHeight}
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
  );

  return (
    <div className="space-y-3">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          {zones.map((zone, index) => {
            const color = zone.color ?? ZONE_MAP_COLORS[index % ZONE_MAP_COLORS.length];
            const hasPolygon = Boolean(zone.polygon?.length);
            return (
              <div key={`${zone.name}-${index}`} className="flex items-center gap-1">
                <Button
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
                  {onZoneRename ? (
                    <Input
                      value={zone.name}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => onZoneRename(index, e.target.value)}
                      className="h-6 w-20 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-0"
                    />
                  ) : (
                    zone.name
                  )}
                  {hasPolygon ? <Check className="h-3 w-3 opacity-70" /> : null}
                </Button>
                {onZoneRemove && zones.length > 1 ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => onZoneRemove(index)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            );
          })}
          {onZoneAdd ? (
            <Button type="button" size="sm" variant="outline" onClick={onZoneAdd}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add zone
            </Button>
          ) : null}
        </div>
      )}

      {!readOnly && (
        <p className="text-xs text-muted-foreground">
          {placingMarker
            ? `Click the map to place a ${MAP_MARKER_STYLES[markerPlacement!].label}.`
            : "Select a zone, then click on the image to place corners. Use at least 3 points and click Complete zone when finished."}
        </p>
      )}

      <div
        ref={outerRef}
        className={cn(
          "overflow-hidden rounded-md border bg-muted/20",
          useCrop ? "relative w-full" : "inline-block max-w-full",
          !readOnly && !useCrop && (placingMarker ? "cursor-pointer" : "cursor-crosshair")
        )}
        style={
          useCrop
            ? {
                width: "100%",
                height: croppedLayout!.outerHeight,
              }
            : undefined
        }
        onClick={!useCrop ? handleImageClick : undefined}
      >
        {mapViewport}
      </div>

      {!readOnly && !placingMarker && (
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

      {markers.length > 0 && onMarkerRemove && !readOnly ? (
        <ul className="space-y-1 text-xs">
          {markers.map((marker) => (
            <li key={marker.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1">
              <span>
                <span
                  className="mr-1.5 inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: MAP_MARKER_STYLES[marker.type].color }}
                />
                {MAP_MARKER_STYLES[marker.type].label}
                {marker.label ? ` — ${marker.label}` : ""}
              </span>
              <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => onMarkerRemove(marker.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
