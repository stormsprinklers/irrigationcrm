import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { uploadPrivateBlob } from "@/lib/blob/storage";
import { formatAddressQuery } from "@/lib/customers/maps";
import {
  fetchGoogleSatelliteScreenshot,
  resolvePropertyCoordinates,
} from "@/lib/customers/static-map";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string; propertyId: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id: customerId, propertyId } = await params;

    const property = await prisma.customerProperty.findFirst({
      where: { id: propertyId, customerId, companyId: user.companyId },
    });
    if (!property) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

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

    const imageBuffer = await fetchGoogleSatelliteScreenshot({
      lat: location.lat,
      lng: location.lng,
    });

    const blob = await uploadPrivateBlob(
      `customers/${user.companyId}/${customerId}/properties/${propertyId}/irrigation-aerial.png`,
      imageBuffer,
      { contentType: "image/png" }
    );

    const updated = await prisma.customerProperty.update({
      where: { id: propertyId },
      data: {
        aerialImageUrl: blob.url,
        latitude: location.lat,
        longitude: location.lng,
      },
    });

    return NextResponse.json({
      aerialImageUrl: updated.aerialImageUrl,
      latitude: updated.latitude,
      longitude: updated.longitude,
      formattedAddress: location.formattedAddress,
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
