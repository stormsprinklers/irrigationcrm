import type { HolidayStrandMap } from "@/lib/holiday-lighting/strand-map";

/**
 * Only values that affect the rendered Google Maps overlays belong here.
 * Estimate polling returns new object instances, so using the map object itself
 * as an effect dependency would rebuild and recenter the viewer every poll.
 */
export function holidayMapRenderKey(map: HolidayStrandMap): string {
  return JSON.stringify({
    center: map.center ? [map.center.lat, map.center.lng] : null,
    features: map.features.map((feature) => ({
      id: feature.id,
      color: feature.color,
      paths: feature.paths.map((path) => path.map((point) => [point.lat, point.lng])),
      placement: feature.placement
        ? [
            feature.placement.latLng.lat,
            feature.placement.latLng.lng,
            feature.placement.radiusMeters,
          ]
        : null,
    })),
  });
}
