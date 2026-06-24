import { geocodeAddress, getGoogleMapsApiKey } from "@/lib/customers/maps";

const AERIAL_ZOOM = 20;
const AERIAL_SIZE = 640;

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
  apiKey?: string;
}) {
  const apiKey = params.apiKey ?? getGoogleMapsApiKey();
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY is not configured");
  }

  const url = buildGoogleStaticSatelliteUrl({
    lat: params.lat,
    lng: params.lng,
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
