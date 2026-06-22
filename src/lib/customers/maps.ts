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

export function getGoogleMapsApiKey() {
  return process.env.GOOGLE_MAPS_API_KEY ?? "";
}

export function buildMapsPlaceEmbedUrl(query: string, apiKey?: string) {
  const key = apiKey ?? getGoogleMapsApiKey();
  if (!key || !query) return null;
  return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${encodeURIComponent(query)}`;
}

export function buildMapsStreetViewEmbedUrl(query: string, apiKey?: string) {
  const key = apiKey ?? getGoogleMapsApiKey();
  if (!key || !query) return null;
  return `https://www.google.com/maps/embed/v1/streetview?key=${encodeURIComponent(key)}&location=${encodeURIComponent(query)}&fov=80&pitch=0`;
}
