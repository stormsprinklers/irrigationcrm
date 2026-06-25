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

export type ImagePoint = [number, number];

export function pointFromGeoJson(geo: unknown): ImagePoint | null {
  if (!geo || typeof geo !== "object") return null;
  const coords = (geo as { coordinates?: number[] }).coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  return [coords[0], coords[1]];
}

export function pointToGeoJson(point: ImagePoint | null) {
  if (!point) return { type: "Point" as const, coordinates: [] as number[] };
  return { type: "Point" as const, coordinates: point };
}

export type NormalizedRect = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type ZonesBoundsOptions = {
  /** Extra space around zone bounds, as a fraction of the bounds size (default 0.12). */
  paddingRatio?: number;
  /** Minimum padding from zone edges, as a fraction of the full image (default 0.05). */
  minPadding?: number;
  /** Do not zoom in past this crop size (fraction of full image, default 0.22). */
  minCropSize?: number;
};

/** Bounding box around all zone polygons, padded and clamped for a tight but safe crop. */
export function computeZonesBounds(
  polygons: (ImagePolygon | null | undefined)[],
  options: ZonesBoundsOptions = {}
): NormalizedRect | null {
  const { paddingRatio = 0.12, minPadding = 0.05, minCropSize = 0.22 } = options;

  const points = polygons.flatMap((polygon) => polygon ?? []);
  if (points.length === 0) return null;

  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const padX = Math.max(minPadding, width * paddingRatio);
  const padY = Math.max(minPadding, height * paddingRatio);

  minX = Math.max(0, minX - padX);
  minY = Math.max(0, minY - padY);
  maxX = Math.min(1, maxX + padX);
  maxY = Math.min(1, maxY + padY);

  let cropW = maxX - minX;
  let cropH = maxY - minY;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  if (cropW < minCropSize) {
    minX = centerX - minCropSize / 2;
    maxX = centerX + minCropSize / 2;
    if (minX < 0) {
      maxX -= minX;
      minX = 0;
    }
    if (maxX > 1) {
      minX -= maxX - 1;
      maxX = 1;
    }
    cropW = maxX - minX;
  }

  if (cropH < minCropSize) {
    minY = centerY - minCropSize / 2;
    maxY = centerY + minCropSize / 2;
    if (minY < 0) {
      maxY -= minY;
      minY = 0;
    }
    if (maxY > 1) {
      minY -= maxY - 1;
      maxY = 1;
    }
    cropH = maxY - minY;
  }

  if (cropW <= 0 || cropH <= 0) return null;
  return { minX, minY, maxX, maxY };
}

/** Bounding box around zone polygons and map marker points. */
export function computeMapFocusBounds(
  polygons: (ImagePolygon | null | undefined)[],
  markerPoints: (ImagePoint | null | undefined)[] = [],
  options: ZonesBoundsOptions = {}
): NormalizedRect | null {
  const zoneBounds = computeZonesBounds(polygons, options);
  const points = markerPoints.filter(Boolean) as ImagePoint[];
  if (!zoneBounds && points.length === 0) return null;
  if (!zoneBounds) return computeZonesBounds([points], options);
  if (points.length === 0) return zoneBounds;

  const allPoints = [...polygons.flatMap((polygon) => polygon ?? []), ...points];
  return computeZonesBounds([allPoints], options);
}

export type CroppedMapLayout = {
  innerWidth: number;
  innerHeight: number;
  outerWidth: number;
  outerHeight: number;
  offsetLeft: number;
  offsetTop: number;
};

/** Pixel layout to crop the aerial image to normalized bounds within a container width. */
export function computeCroppedMapLayout(
  bounds: NormalizedRect,
  imageNaturalWidth: number,
  imageNaturalHeight: number,
  containerWidth: number,
  maxOuterHeight = 448
): CroppedMapLayout | null {
  if (!imageNaturalWidth || !imageNaturalHeight || !containerWidth) return null;

  const cropW = bounds.maxX - bounds.minX;
  const cropH = bounds.maxY - bounds.minY;
  if (cropW <= 0 || cropH <= 0) return null;

  const imageAspect = imageNaturalWidth / imageNaturalHeight;
  let innerWidth = containerWidth / cropW;
  let innerHeight = innerWidth / imageAspect;
  let outerWidth = containerWidth;
  let outerHeight = cropH * innerHeight;

  if (outerHeight > maxOuterHeight) {
    outerHeight = maxOuterHeight;
    innerHeight = outerHeight / cropH;
    innerWidth = innerHeight * imageAspect;
    outerWidth = cropW * innerWidth;
  }

  return {
    innerWidth,
    innerHeight,
    outerWidth,
    outerHeight,
    offsetLeft: -bounds.minX * innerWidth,
    offsetTop: -bounds.minY * innerHeight,
  };
}
