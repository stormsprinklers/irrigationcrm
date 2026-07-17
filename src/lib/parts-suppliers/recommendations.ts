import { getGoogleMapsApiKey } from "@/lib/customers/maps";
import { formatPostalAddress, googleMapsDirectionsUrl } from "@/lib/maps";
import { isSupplierOpenNow } from "./hours";
import type { PartsRunOption, PartsSupplierRecord } from "./types";

export async function rankSuppliersForPartsRun(params: {
  suppliers: PartsSupplierRecord[];
  originLat: number;
  originLng: number;
  timezone: string;
  limit?: number;
  /** Include suppliers that are closed right now (ranked after open ones). */
  includeClosed?: boolean;
}): Promise<PartsRunOption[]> {
  const {
    suppliers,
    originLat,
    originLng,
    timezone,
    limit = 2,
    includeClosed = false,
  } = params;

  const withCoords = suppliers.filter(
    (s) => s.isActive && s.latitude != null && s.longitude != null
  );

  const candidates = includeClosed
    ? withCoords
    : withCoords.filter((s) => isSupplierOpenNow(s.hoursJson, s.timezone ?? timezone));

  if (!candidates.length) return [];

  const driveTimes = await computeDriveTimes({
    originLat,
    originLng,
    destinations: candidates.map((s) => ({
      id: s.id,
      lat: s.latitude!,
      lng: s.longitude!,
    })),
  });

  // If Distance Matrix is unavailable, fall back to straight-line distance so
  // mobile/PWA still ranks by proximity instead of arbitrary list order.
  const useHaversineFallback = driveTimes.size === 0;

  const ranked = candidates
    .map((supplier) => {
      const drive = driveTimes.get(supplier.id);
      const address =
        formatPostalAddress({
          address: supplier.address,
          city: supplier.city,
          state: supplier.state,
          zip: supplier.zip,
        }) ?? supplier.name;

      const haversineMiles = useHaversineFallback
        ? haversineMilesBetween(
            originLat,
            originLng,
            supplier.latitude!,
            supplier.longitude!
          )
        : null;

      return {
        supplierId: supplier.id,
        name: supplier.name,
        address,
        city: supplier.city,
        phone: supplier.phone,
        weekdayHours: supplier.weekdayHours,
        isOpenNow: isSupplierOpenNow(supplier.hoursJson, supplier.timezone ?? timezone),
        driveMinutes:
          drive?.durationMinutes ??
          (haversineMiles != null ? Math.max(1, Math.round(haversineMiles * 2.2)) : null),
        driveDistanceMiles: drive?.distanceMiles ?? haversineMiles,
        mapsUrl: googleMapsDirectionsUrl(address),
      } satisfies PartsRunOption;
    })
    .sort((a, b) => {
      // Open suppliers first, then closest by drive time / estimated distance.
      if (a.isOpenNow !== b.isOpenNow) return a.isOpenNow ? -1 : 1;
      const aDrive = a.driveMinutes ?? Number.MAX_SAFE_INTEGER;
      const bDrive = b.driveMinutes ?? Number.MAX_SAFE_INTEGER;
      return aDrive - bDrive;
    });

  return ranked.slice(0, limit);
}

function haversineMilesBetween(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(3958.8 * c * 10) / 10;
}

async function computeDriveTimes(params: {
  originLat: number;
  originLng: number;
  destinations: Array<{ id: string; lat: number; lng: number }>;
}): Promise<Map<string, { durationMinutes: number; distanceMiles: number }>> {
  const result = new Map<string, { durationMinutes: number; distanceMiles: number }>();
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey || !params.destinations.length) return result;

  const destinationParam = params.destinations
    .map((d) => `${d.lat},${d.lng}`)
    .join("|");

  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  url.searchParams.set("origins", `${params.originLat},${params.originLng}`);
  url.searchParams.set("destinations", destinationParam);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("departure_time", "now");
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) return result;

  const data = (await res.json()) as {
    rows?: Array<{
      elements?: Array<{
        status?: string;
        duration_in_traffic?: { value?: number };
        duration?: { value?: number };
        distance?: { value?: number };
      }>;
    }>;
  };

  const elements = data.rows?.[0]?.elements ?? [];
  params.destinations.forEach((dest, index) => {
    const element = elements[index];
    if (!element || element.status !== "OK") return;
    const seconds = element.duration_in_traffic?.value ?? element.duration?.value ?? 0;
    const meters = element.distance?.value ?? 0;
    result.set(dest.id, {
      durationMinutes: Math.max(1, Math.round(seconds / 60)),
      distanceMiles: Math.round((meters / 1609.34) * 10) / 10,
    });
  });

  return result;
}
