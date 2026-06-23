import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import {
  buildMapsPlaceEmbedUrl,
  buildMapsStreetViewEmbedUrl,
  geocodeAddress,
  getGoogleMapsApiKey,
} from "@/lib/customers/maps";

const MAP_ZOOM = 14;

export async function GET(request: NextRequest) {
  try {
    await requireSessionUser();
    const query = request.nextUrl.searchParams.get("q")?.trim();
    if (!query) return badRequestResponse("q is required");

    const apiKey = getGoogleMapsApiKey();
    if (!apiKey) {
      return NextResponse.json({ configured: false, placeEmbed: null, streetEmbed: null });
    }

    const geocoded = await geocodeAddress(query, apiKey);

    if (geocoded) {
      const placeQuery = `${geocoded.lat},${geocoded.lng}`;
      return NextResponse.json({
        configured: true,
        formattedAddress: geocoded.formattedAddress,
        // place mode shows a pin; view mode only centers the map with no marker
        placeEmbed: buildMapsPlaceEmbedUrl(placeQuery, apiKey, MAP_ZOOM),
        streetEmbed: buildMapsStreetViewEmbedUrl(geocoded.lat, geocoded.lng, apiKey),
      });
    }

    return NextResponse.json({
      configured: true,
      placeEmbed: buildMapsPlaceEmbedUrl(query, apiKey, MAP_ZOOM),
      streetEmbed: null,
    });
  } catch {
    return unauthorizedResponse();
  }
}
