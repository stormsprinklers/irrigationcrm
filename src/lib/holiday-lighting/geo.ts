/** Haversine path length in feet (client-safe). */
export function pathLengthFeet(path: Array<{ lat: number; lng: number }>): number {
  if (path.length < 2) return 0;
  const R = 20902231; // earth radius in feet
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    total += haversineFeet(a, b);
  }
  return Math.round(total * 10) / 10;
}

function haversineFeet(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 20902231;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
