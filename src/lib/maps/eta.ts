import { geocodeAddress, getGoogleMapsApiKey } from "@/lib/customers/maps";
import { formatPostalAddress } from "@/lib/maps";

export type VisitAddressSource = {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  property?: {
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
  } | null;
  customer?: {
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
  } | null;
};

export type DrivingEtaResult = {
  durationSeconds: number;
  durationInTrafficSeconds: number;
  distanceMeters: number;
  arrivalAt: Date;
  destinationLat: number;
  destinationLng: number;
  destinationAddress: string;
};

export class MapsEtaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MapsEtaError";
  }
}

export function resolveVisitDestination(visit: VisitAddressSource): string | null {
  const fromVisit = formatPostalAddress(visit);
  if (fromVisit) return fromVisit;
  if (visit.property) {
    const fromProperty = formatPostalAddress(visit.property);
    if (fromProperty) return fromProperty;
  }
  if (visit.customer) {
    return formatPostalAddress(visit.customer);
  }
  return null;
}

export function formatVisitEtaPayload(visit: {
  enRouteEtaSeconds: number | null;
  enRouteEtaAt: Date | null;
  enRouteCalculatedAt: Date | null;
}) {
  if (!visit.enRouteEtaSeconds || !visit.enRouteEtaAt) return null;
  return {
    minutes: Math.max(1, Math.round(visit.enRouteEtaSeconds / 60)),
    arrivalAt: visit.enRouteEtaAt.toISOString(),
    calculatedAt: visit.enRouteCalculatedAt?.toISOString() ?? null,
  };
}

export async function computeDrivingEta(params: {
  originLat: number;
  originLng: number;
  destinationAddress: string;
}): Promise<DrivingEtaResult> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    throw new MapsEtaError("GOOGLE_MAPS_API_KEY is not configured");
  }

  const geocoded = await geocodeAddress(params.destinationAddress, apiKey);
  if (!geocoded) {
    throw new MapsEtaError("Could not geocode visit address");
  }

  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  url.searchParams.set("origins", `${params.originLat},${params.originLng}`);
  url.searchParams.set("destinations", `${geocoded.lat},${geocoded.lng}`);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("departure_time", "now");
  url.searchParams.set("traffic_model", "best_guess");
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new MapsEtaError(`Distance Matrix request failed (${res.status})`);
  }

  const data = (await res.json()) as {
    status?: string;
    error_message?: string;
    rows?: Array<{
      elements?: Array<{
        status?: string;
        distance?: { value?: number };
        duration?: { value?: number };
        duration_in_traffic?: { value?: number };
      }>;
    }>;
  };

  if (data.status !== "OK") {
    throw new MapsEtaError(data.error_message ?? `Distance Matrix error: ${data.status ?? "unknown"}`);
  }

  const element = data.rows?.[0]?.elements?.[0];
  if (!element || element.status !== "OK") {
    throw new MapsEtaError("No driving route found to visit address");
  }

  const durationSeconds = element.duration?.value ?? 0;
  const durationInTrafficSeconds = element.duration_in_traffic?.value ?? durationSeconds;
  const distanceMeters = element.distance?.value ?? 0;
  const arrivalAt = new Date(Date.now() + durationInTrafficSeconds * 1000);

  return {
    durationSeconds,
    durationInTrafficSeconds,
    distanceMeters,
    arrivalAt,
    destinationLat: geocoded.lat,
    destinationLng: geocoded.lng,
    destinationAddress: geocoded.formattedAddress,
  };
}
