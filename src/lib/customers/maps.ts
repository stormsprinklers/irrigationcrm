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
};

export async function geocodeAddress(
  query: string,
  apiKey: string
): Promise<GeocodedLocation | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", query);
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    status?: string;
    results?: Array<{
      formatted_address?: string;
      geometry?: { location?: { lat?: number; lng?: number } };
    }>;
  };

  if (data.status !== "OK" || !data.results?.[0]?.geometry?.location) {
    return null;
  }

  const { lat, lng } = data.results[0].geometry.location;
  if (lat == null || lng == null) return null;

  return {
    lat,
    lng,
    formattedAddress: data.results[0].formatted_address ?? query,
  };
}

export function getGoogleMapsApiKey() {
  return process.env.GOOGLE_MAPS_API_KEY ?? "";
}

export function buildMapsPlaceEmbedUrl(query: string, apiKey?: string, zoom = 14) {
  const key = apiKey ?? getGoogleMapsApiKey();
  if (!key || !query) return null;
  return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${encodeURIComponent(query)}&zoom=${zoom}`;
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
