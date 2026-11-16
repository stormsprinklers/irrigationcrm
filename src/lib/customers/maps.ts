export function buildGoogleMapsUrl(parts: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}) {
  const query = [parts.address, parts.city, parts.state, parts.zip].filter(Boolean).join(", ");
  if (!query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function formatCustomerAddress(parts: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}) {
  const line1 = parts.address?.trim();
  const line2 = [parts.city, parts.state, parts.zip].filter(Boolean).join(", ");
  if (line1 && line2) return `${line1}, ${line2}`;
  return line1 || line2 || null;
}

export function formatAddressQuery(parts: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}) {
  return [parts.address, parts.city, parts.state, parts.zip].filter(Boolean).join(", ").trim() || null;
}

export function addressNeedsGoogleNormalization(parts: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}) {
  if (!parts.address?.trim()) return false;
  if (parts.city?.trim() && parts.state?.trim() && parts.zip?.trim()) return false;

  // Do not ask Google to guess from an unqualified street line. A city, state,
  // or ZIP (including one embedded in a legacy single-field address) is needed.
  return Boolean(
    parts.city?.trim() ||
      parts.state?.trim() ||
      parts.zip?.trim() ||
      /\b\d{5}(?:-\d{4})?\b/.test(parts.address)
  );
}

/** Prefer an address that includes a street line (avoids POI / city-center guesses). */
export function pickBestAddressForMap(
  customer: {
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
  } | null,
  properties: Array<{
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    isPrimary?: boolean;
  }>
) {
  const primary = properties.find((p) => p.isPrimary) ?? properties[0];
  const candidates = [
    primary
      ? {
          address: primary.address,
          city: primary.city,
          state: primary.state,
          zip: primary.zip,
        }
      : null,
    customer
      ? {
          address: customer.address,
          city: customer.city,
          state: customer.state,
          zip: customer.zip,
        }
      : null,
  ].filter(Boolean) as Array<{
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
  }>;

  const withStreet = candidates.find((c) => c.address?.trim());
  if (withStreet) return withStreet;

  const withAny = candidates.find((c) => formatAddressQuery(c));
  return (
    withAny ?? {
      address: null,
      city: null,
      state: null,
      zip: null,
    }
  );
}

export type GeocodedLocation = {
  lat: number;
  lng: number;
  formattedAddress: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  partialMatch: boolean;
};

type GoogleAddressComponent = {
  long_name?: string;
  short_name?: string;
  types?: string[];
};

type GoogleGeocodeResult = {
  formatted_address?: string;
  partial_match?: boolean;
  address_components?: GoogleAddressComponent[];
  geometry?: { location?: { lat?: number; lng?: number } };
};

function geocodeComponent(components: GoogleAddressComponent[], type: string) {
  return components.find((component) => component.types?.includes(type));
}

export function parseGoogleGeocodeResult(
  result: GoogleGeocodeResult,
  query: string
): GeocodedLocation | null {
  const lat = result.geometry?.location?.lat;
  const lng = result.geometry?.location?.lng;
  if (lat == null || lng == null) return null;

  const components = result.address_components ?? [];
  const streetNumber = geocodeComponent(components, "street_number")?.long_name;
  const route = geocodeComponent(components, "route")?.long_name;
  const address =
    [streetNumber, route].filter(Boolean).join(" ").trim() ||
    geocodeComponent(components, "premise")?.long_name ||
    null;
  const city =
    geocodeComponent(components, "locality")?.long_name ??
    geocodeComponent(components, "postal_town")?.long_name ??
    geocodeComponent(components, "sublocality")?.long_name ??
    geocodeComponent(components, "administrative_area_level_3")?.long_name ??
    null;
  const state =
    geocodeComponent(components, "administrative_area_level_1")?.short_name ?? null;
  const zip = geocodeComponent(components, "postal_code")?.long_name ?? null;

  return {
    lat,
    lng,
    formattedAddress: result.formatted_address ?? query,
    address,
    city,
    state,
    zip,
    partialMatch: Boolean(result.partial_match),
  };
}

export async function geocodeAddress(
  query: string,
  apiKey: string
): Promise<GeocodedLocation | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", query);
  url.searchParams.set("region", "us");
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    status?: string;
    results?: GoogleGeocodeResult[];
  };

  if (data.status !== "OK" || !data.results?.[0]) return null;
  return parseGoogleGeocodeResult(data.results[0], query);
}

export function getGoogleMapsApiKey() {
  return process.env.GOOGLE_MAPS_API_KEY ?? "";
}

export function buildMapsPlaceEmbedUrl(query: string, apiKey?: string, zoom = 14) {
  const key = apiKey ?? getGoogleMapsApiKey();
  if (!key || !query) return null;
  return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${encodeURIComponent(query)}&zoom=${zoom}`;
}

/** Place-mode embed that drops a pin at lat/lng. View mode only centers with no marker. */
export function buildMapsPinEmbedUrl(lat: number, lng: number, apiKey?: string, zoom = 14) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return buildMapsPlaceEmbedUrl(`${lat},${lng}`, apiKey, zoom);
}

export function buildMapsDirectionsEmbedUrl(params: {
  originLat: number;
  originLng: number;
  destination: string;
  apiKey?: string;
}) {
  const key = params.apiKey ?? getGoogleMapsApiKey();
  if (!key || !params.destination.trim()) return null;
  if (!Number.isFinite(params.originLat) || !Number.isFinite(params.originLng)) return null;
  const url = new URL("https://www.google.com/maps/embed/v1/directions");
  url.searchParams.set("key", key);
  url.searchParams.set("origin", `${params.originLat},${params.originLng}`);
  url.searchParams.set("destination", params.destination.trim());
  url.searchParams.set("mode", "driving");
  return url.toString();
}

export function buildMapsViewEmbedUrl(
  lat: number,
  lng: number,
  apiKey?: string,
  zoom = 14
) {
  const key = apiKey ?? getGoogleMapsApiKey();
  if (!key) return null;
  return `https://www.google.com/maps/embed/v1/view?key=${encodeURIComponent(key)}&center=${lat},${lng}&zoom=${zoom}&maptype=roadmap`;
}

export function buildMapsStreetViewEmbedUrl(
  lat: number,
  lng: number,
  apiKey?: string
) {
  const key = apiKey ?? getGoogleMapsApiKey();
  if (!key) return null;
  return `https://www.google.com/maps/embed/v1/streetview?key=${encodeURIComponent(key)}&location=${lat},${lng}&fov=80&pitch=0`;
}
