type AddressParts = {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

export function formatPostalAddress(parts: AddressParts): string | null {
  const value = [parts.address, parts.city, parts.state, parts.zip].filter(Boolean).join(", ");
  return value || null;
}

export function googleMapsDirectionsUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}
