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
