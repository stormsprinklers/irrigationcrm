import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import {
  badRequestResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { uploadPrivateBlob } from "@/lib/blob/storage";
import { formatAddressQuery } from "@/lib/customers/maps";
import {
  AERIAL_ZOOM,
  type AerialCapture,
  type AerialCrop,
  computeCaptureBounds,
  computeCropCapture,
  fetchGoogleSatelliteScreenshot,
  remapNormalizedPoint,
  resolvePropertyCoordinates,
} from "@/lib/customers/static-map";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string; propertyId: string }> };

function parseCrop(value: unknown): AerialCrop | null {
  if (!value || typeof value !== "object") return null;
  const c = value as Record<string, unknown>;
  const x = Number(c.x);
  const y = Number(c.y);
  const width = Number(c.width);
  const height = Number(c.height);
  if ([x, y, width, height].some((n) => !Number.isFinite(n))) return null;
  // Ignore no-op / degenerate crops.
  if (width <= 0.02 || height <= 0.02) return null;
  if (width >= 0.999 && height >= 0.999 && x <= 0.001 && y <= 0.001) return null;
  const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
  return {
    x: clamp01(x),
    y: clamp01(y),
    width: clamp01(width),
    height: clamp01(height),
  };
}

function remapPolygon(oldCap: AerialCapture, newCap: AerialCapture, geo: unknown) {
  const value = geo as { type?: string; coordinates?: number[][][] } | null;
  const ring = value?.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length === 0) return geo;
  const mapped = ring.map((pt) =>
    remapNormalizedPoint(oldCap, newCap, [Number(pt?.[0]), Number(pt?.[1])])
  );
  return { type: "Polygon", coordinates: [mapped] };
}

function remapPoint(oldCap: AerialCapture, newCap: AerialCapture, geo: unknown) {
  const value = geo as { type?: string; coordinates?: number[] } | null;
  const coords = value?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return geo;
  const mapped = remapNormalizedPoint(oldCap, newCap, [Number(coords[0]), Number(coords[1])]);
  return { type: "Point", coordinates: mapped };
}

async function remapAllGeometry(
  propertyId: string,
  oldCap: AerialCapture,
  newCap: AerialCapture
) {
  const [zones, valves, controllers, markers] = await Promise.all([
    prisma.propertyIrrigationMapZone.findMany({ where: { propertyId } }),
    prisma.propertyIrrigationValve.findMany({ where: { propertyId } }),
    prisma.propertyIrrigationController.findMany({ where: { propertyId } }),
    prisma.propertyIrrigationMapMarker.findMany({ where: { propertyId } }),
  ]);

  await Promise.all([
    ...zones.map((zone) =>
      prisma.propertyIrrigationMapZone.update({
        where: { id: zone.id },
        data: {
          polygonGeoJson: remapPolygon(oldCap, newCap, zone.polygonGeoJson) as Prisma.InputJsonValue,
        },
      })
    ),
    ...valves.map((valve) =>
      prisma.propertyIrrigationValve.update({
        where: { id: valve.id },
        data: {
          pointGeoJson: remapPoint(oldCap, newCap, valve.pointGeoJson) as Prisma.InputJsonValue,
        },
      })
    ),
    ...controllers.map((controller) =>
      prisma.propertyIrrigationController.update({
        where: { id: controller.id },
        data: {
          pointGeoJson: remapPoint(oldCap, newCap, controller.pointGeoJson) as Prisma.InputJsonValue,
        },
      })
    ),
    ...markers.map((marker) =>
      prisma.propertyIrrigationMapMarker.update({
        where: { id: marker.id },
        data: {
          pointGeoJson: remapPoint(oldCap, newCap, marker.pointGeoJson) as Prisma.InputJsonValue,
        },
      })
    ),
  ]);
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id: customerId, propertyId } = await params;

    const property = await prisma.customerProperty.findFirst({
      where: { id: propertyId, customerId, companyId: user.companyId },
    });
    if (!property) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const crop = parseCrop(body.crop);

    // The capture that produced the current image (for cropping + remapping existing zones).
    const hasExistingCapture =
      Boolean(property.aerialImageUrl) &&
      property.aerialCenterLat != null &&
      property.aerialCenterLng != null;
    const oldCapture: AerialCapture | null = hasExistingCapture
      ? {
          lat: property.aerialCenterLat as number,
          lng: property.aerialCenterLng as number,
          zoom: property.aerialZoom ?? AERIAL_ZOOM,
        }
      : property.aerialImageUrl && property.latitude != null && property.longitude != null
        ? { lat: property.latitude, lng: property.longitude, zoom: property.aerialZoom ?? AERIAL_ZOOM }
        : null;

    let newCapture: AerialCapture;
    let formattedAddress: string | undefined;

    if (crop && oldCapture) {
      // Crop / zoom in: recenter and increase zoom on the selected region.
      newCapture = computeCropCapture(oldCapture, crop);
    } else {
      // Initial capture or "reset to full property view": geocode and use the default zoom.
      const addressQuery = formatAddressQuery({
        address: property.address,
        city: property.city,
        state: property.state,
        zip: property.zip,
      });
      if (!addressQuery) {
        return badRequestResponse("Property address is required to capture an aerial image");
      }
      const location = await resolvePropertyCoordinates({
        addressQuery,
        latitude: property.latitude,
        longitude: property.longitude,
      });
      newCapture = { lat: location.lat, lng: location.lng, zoom: AERIAL_ZOOM };
      formattedAddress = location.formattedAddress;
    }

    const imageBuffer = await fetchGoogleSatelliteScreenshot({
      lat: newCapture.lat,
      lng: newCapture.lng,
      zoom: newCapture.zoom,
    });

    const blob = await uploadPrivateBlob(
      `customers/${user.companyId}/${customerId}/properties/${propertyId}/irrigation-aerial.png`,
      imageBuffer,
      { contentType: "image/png", addRandomSuffix: true }
    );

    // Keep any drawn zones/markers aligned with the new image.
    if (oldCapture) {
      await remapAllGeometry(propertyId, oldCapture, newCapture);
    }

    const updated = await prisma.customerProperty.update({
      where: { id: propertyId },
      data: {
        aerialImageUrl: blob.url,
        aerialCenterLat: newCapture.lat,
        aerialCenterLng: newCapture.lng,
        aerialZoom: newCapture.zoom,
        mapBounds: computeCaptureBounds(newCapture) as Prisma.InputJsonValue,
        // For the initial/full capture also seed the property's own coordinates.
        ...(crop && oldCapture
          ? {}
          : { latitude: newCapture.lat, longitude: newCapture.lng }),
      },
    });

    return NextResponse.json({
      aerialImageUrl: updated.aerialImageUrl,
      latitude: updated.latitude,
      longitude: updated.longitude,
      aerialZoom: updated.aerialZoom,
      cropped: Boolean(crop && oldCapture),
      formattedAddress,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Aerial capture failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to capture aerial image",
      },
      { status: 500 }
    );
  }
}
