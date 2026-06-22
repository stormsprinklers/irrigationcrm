import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import {
  buildMapsPlaceEmbedUrl,
  buildMapsStreetViewEmbedUrl,
  getGoogleMapsApiKey,
} from "@/lib/customers/maps";

export async function GET(request: NextRequest) {
  try {
    await requireSessionUser();
    const query = request.nextUrl.searchParams.get("q")?.trim();
    if (!query) return badRequestResponse("q is required");

    const apiKey = getGoogleMapsApiKey();
    if (!apiKey) {
      return NextResponse.json({ configured: false, placeEmbed: null, streetEmbed: null });
    }

    return NextResponse.json({
      configured: true,
      placeEmbed: buildMapsPlaceEmbedUrl(query, apiKey),
      streetEmbed: buildMapsStreetViewEmbedUrl(query, apiKey),
    });
  } catch {
    return unauthorizedResponse();
  }
}
