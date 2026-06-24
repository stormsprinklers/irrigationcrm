/** Normalized image coordinates: x and y are 0–1 relative to aerial image (y increases downward). */

export type ImagePolygon = [number, number][];

export function polygonFromGeoJson(geo: unknown): ImagePolygon | null {
  if (!geo || typeof geo !== "object") return null;
  const ring = (geo as { coordinates?: number[][][] }).coordinates?.[0];
  if (!Array.isArray(ring) || ring.length < 3) return null;

  const points = ring.map((pair) => [pair[0], pair[1]] as [number, number]);
  const first = points[0];
  const last = points[points.length - 1];
  if (first && last && first[0] === last[0] && first[1] === last[1]) {
    return points.slice(0, -1);
  }
  return points;
}

export function polygonToGeoJson(polygon: ImagePolygon | null) {
  if (!polygon?.length) {
    return { type: "Polygon" as const, coordinates: [] as number[][][] };
  }
  const ring = [...polygon, polygon[0]];
  return { type: "Polygon" as const, coordinates: [ring] };
}

export function polygonCentroid(polygon: ImagePolygon): [number, number] {
  let x = 0;
  let y = 0;
  for (const [px, py] of polygon) {
    x += px;
    y += py;
  }
  return [x / polygon.length, y / polygon.length];
}

export function polygonToSvgPoints(polygon: ImagePolygon, width: number, height: number) {
  return polygon.map(([x, y]) => `${x * width},${y * height}`).join(" ");
}
