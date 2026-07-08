import { geocodeAddress, getGoogleMapsApiKey } from "@/lib/customers/maps";

export const AERIAL_ZOOM = 20;
export const AERIAL_SIZE = 640;
/** Google satellite imagery is generally available up to ~z21-22; cap to avoid gray tiles. */
export const MAX_AERIAL_ZOOM = 22;
export const MIN_AERIAL_ZOOM = 1;

const MERCATOR_TILE = 256;

/** A satellite capture: geographic center + integer zoom. Image is AERIAL_SIZE logical px square. */
export type AerialCapture = { lat: number; lng: number; zoom: number };

/** Normalized crop rectangle relative to the current aerial image (each value 0..1). */
export type AerialCrop = { x: number; y: number; width: number; height: number };

function projectToWorld(lat: number, lng: number) {
  const siny = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
  const x = MERCATOR_TILE * (0.5 + lng / 360);
  const y = MERCATOR_TILE * (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI));
  return { x, y };
}

function unprojectFromWorld(x: number, y: number) {
  const lng = (x / MERCATOR_TILE - 0.5) * 360;
  const lat =
    (Math.asin(Math.tanh((0.5 - y / MERCATOR_TILE) * 2 * Math.PI)) * 180) / Math.PI;
  return { lat, lng };
}

/** Convert a normalized image point (0..1) on a capture to geographic coordinates. */
export function imageNormToLatLng(cap: AerialCapture, nx: number, ny: number) {
  const scale = Math.pow(2, cap.zoom);
  const center = projectToWorld(cap.lat, cap.lng);
  const px = center.x * scale + (nx - 0.5) * AERIAL_SIZE;
  const py = center.y * scale + (ny - 0.5) * AERIAL_SIZE;
  return unprojectFromWorld(px / scale, py / scale);
}

/** Convert geographic coordinates to a normalized image point (0..1) on a capture. */
export function latLngToImageNorm(cap: AerialCapture, lat: number, lng: number) {
  const scale = Math.pow(2, cap.zoom);
  const center = projectToWorld(cap.lat, cap.lng);
  const point = projectToWorld(lat, lng);
  const nx = ((point.x - center.x) * scale) / AERIAL_SIZE + 0.5;
  const ny = ((point.y - center.y) * scale) / AERIAL_SIZE + 0.5;
  return { nx, ny };
}

/** Given the current capture and a normalized crop rectangle, compute a tighter, sharper capture. */
export function computeCropCapture(oldCap: AerialCapture, crop: AerialCrop): AerialCapture {
  const centerNx = crop.x + crop.width / 2;
  const centerNy = crop.y + crop.height / 2;
  const center = imageNormToLatLng(oldCap, centerNx, centerNy);
  const span = Math.max(crop.width, crop.height, 0.05);
  // Each halving of the visible span is one extra zoom level. Floor so the whole crop still fits.
  const zoom = Math.min(
    MAX_AERIAL_ZOOM,
    Math.max(MIN_AERIAL_ZOOM, Math.floor(oldCap.zoom - Math.log2(span)))
  );
  return { lat: center.lat, lng: center.lng, zoom };
}

/** Remap a normalized point from one capture's image space to another's, clamped to [0,1]. */
export function remapNormalizedPoint(
  oldCap: AerialCapture,
  newCap: AerialCapture,
  point: [number, number]
): [number, number] {
  const geo = imageNormToLatLng(oldCap, point[0], point[1]);
  const { nx, ny } = latLngToImageNorm(newCap, geo.lat, geo.lng);
  const clamp = (v: number) => Math.min(1, Math.max(0, Math.round(v * 1000) / 1000));
  return [clamp(nx), clamp(ny)];
}

/** Geographic bounds of a capture as [[minLng, minLat], [maxLng, maxLat]]. */
export function computeCaptureBounds(cap: AerialCapture) {
  const topLeft = imageNormToLatLng(cap, 0, 0);
  const bottomRight = imageNormToLatLng(cap, 1, 1);
  return [
    [Math.min(topLeft.lng, bottomRight.lng), Math.min(topLeft.lat, bottomRight.lat)],
    [Math.max(topLeft.lng, bottomRight.lng), Math.max(topLeft.lat, bottomRight.lat)],
  ];
}

export function buildGoogleStaticSatelliteUrl(params: {
  lat: number;
  lng: number;
  apiKey: string;
  width?: number;
  height?: number;
  zoom?: number;
}) {
  const url = new URL("https://maps.googleapis.com/maps/api/staticmap");
  url.searchParams.set("center", `${params.lat},${params.lng}`);
  url.searchParams.set("zoom", String(params.zoom ?? AERIAL_ZOOM));
  url.searchParams.set("size", `${params.width ?? AERIAL_SIZE}x${params.height ?? AERIAL_SIZE}`);
  url.searchParams.set("scale", "2");
  url.searchParams.set("maptype", "satellite");
  url.searchParams.set("key", params.apiKey);
  return url.toString();
}

export async function fetchGoogleSatelliteScreenshot(params: {
  lat: number;
  lng: number;
  zoom?: number;
  apiKey?: string;
}) {
  const apiKey = params.apiKey ?? getGoogleMapsApiKey();
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY is not configured");
  }

  const url = buildGoogleStaticSatelliteUrl({
    lat: params.lat,
    lng: params.lng,
    zoom: params.zoom,
    apiKey,
  });

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Google Static Maps request failed (${res.status})`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    throw new Error("Google Static Maps did not return an image. Enable the Maps Static API.");
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function resolvePropertyCoordinates(params: {
  addressQuery: string;
  latitude?: number | null;
  longitude?: number | null;
  apiKey?: string;
}) {
  if (params.latitude != null && params.longitude != null) {
    return {
      lat: params.latitude,
      lng: params.longitude,
      formattedAddress: params.addressQuery,
    };
  }

  const apiKey = params.apiKey ?? getGoogleMapsApiKey();
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY is not configured");
  }

  const geocoded = await geocodeAddress(params.addressQuery, apiKey);
  if (!geocoded) {
    throw new Error("Could not geocode property address");
  }

  return geocoded;
}
