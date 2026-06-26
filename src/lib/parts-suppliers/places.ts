import { getGoogleMapsApiKey } from "@/lib/customers/maps";
import type { Prisma } from "@prisma/client";
import type { PlaceSearchResult, SupplierHoursJson } from "./types";

const PLACE_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.nationalPhoneNumber",
  "places.regularOpeningHours",
  "places.currentOpeningHours",
].join(",");

const DETAIL_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "nationalPhoneNumber",
  "regularOpeningHours",
  "currentOpeningHours",
].join(",");

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  nationalPhoneNumber?: string;
  regularOpeningHours?: SupplierHoursJson;
  currentOpeningHours?: SupplierHoursJson;
};

function normalizePlaceId(id: string): string {
  return id.replace(/^places\//, "");
}

function parseAddressParts(formattedAddress: string) {
  const parts = formattedAddress.split(",").map((p) => p.trim());
  if (parts.length < 2) {
    return { address: formattedAddress, city: null, state: null, zip: null };
  }

  const address = parts[0] ?? null;
  const city = parts.length >= 3 ? parts[parts.length - 3] : parts[1] ?? null;
  const stateZip = parts[parts.length - 2] ?? "";
  const stateZipMatch = stateZip.match(/^([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  return {
    address,
    city,
    state: stateZipMatch?.[1] ?? null,
    zip: stateZipMatch?.[2] ?? null,
  };
}

function mapPlace(place: GooglePlace): PlaceSearchResult {
  const googlePlaceId = place.id ? normalizePlaceId(place.id) : "";
  const hours = place.currentOpeningHours ?? place.regularOpeningHours ?? null;

  return {
    googlePlaceId,
    name: place.displayName?.text ?? "Supplier",
    formattedAddress: place.formattedAddress ?? "",
    latitude: place.location?.latitude ?? null,
    longitude: place.location?.longitude ?? null,
    phone: place.nationalPhoneNumber ?? null,
    hours,
    weekdayHours: hours?.weekdayDescriptions ?? [],
  };
}

export class PlacesApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlacesApiError";
  }
}

export async function searchPlaces(textQuery: string): Promise<PlaceSearchResult[]> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) throw new PlacesApiError("GOOGLE_MAPS_API_KEY is not configured");

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": PLACE_FIELD_MASK,
    },
    body: JSON.stringify({ textQuery, maxResultCount: 5 }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new PlacesApiError(`Places search failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { places?: GooglePlace[] };
  return (data.places ?? []).map(mapPlace).filter((p) => p.googlePlaceId);
}

export async function getPlaceDetails(googlePlaceId: string): Promise<PlaceSearchResult> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) throw new PlacesApiError("GOOGLE_MAPS_API_KEY is not configured");

  const id = normalizePlaceId(googlePlaceId);
  const res = await fetch(`https://places.googleapis.com/v1/places/${id}`, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": DETAIL_FIELD_MASK,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new PlacesApiError(`Place details failed (${res.status}): ${text}`);
  }

  const place = (await res.json()) as GooglePlace;
  return mapPlace(place);
}

export function placeToSupplierData(place: PlaceSearchResult, timezone: string | null) {
  const parsed = parseAddressParts(place.formattedAddress);
  return {
    name: place.name,
    googlePlaceId: place.googlePlaceId,
    address: parsed.address,
    city: parsed.city,
    state: parsed.state,
    zip: parsed.zip,
    latitude: place.latitude,
    longitude: place.longitude,
    phone: place.phone,
    hoursJson: (place.hours ?? undefined) as Prisma.InputJsonValue | undefined,
    weekdayHours: place.weekdayHours,
    timezone,
    lastSyncedAt: new Date(),
  };
}

export function extractPlaceIdFromInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^ChI[\w-]+$/.test(trimmed)) return trimmed;

  const cidMatch = trimmed.match(/[?&]query_place_id=([^&]+)/);
  if (cidMatch?.[1]) return decodeURIComponent(cidMatch[1]);

  const placeIdMatch = trimmed.match(/place_id[=:]([^&\s]+)/i);
  if (placeIdMatch?.[1]) return decodeURIComponent(placeIdMatch[1]);

  return null;
}
