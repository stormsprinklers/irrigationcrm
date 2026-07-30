import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { assertHolidayLightingEnabled } from "@/lib/holiday-lighting/catalog";
import { geocodeAddress, getGoogleMapsApiKey } from "@/lib/customers/maps";
import { prisma } from "@/lib/prisma";

/** Geocode an address for the holiday lighting quoter. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { holidayLightingFeaturesEnabled: true },
    });
    assertHolidayLightingEnabled(company ?? {});

    const body = await request.json();
    const address = [
      typeof body.address === "string" ? body.address : "",
      typeof body.city === "string" ? body.city : "",
      typeof body.state === "string" ? body.state : "",
      typeof body.zip === "string" ? body.zip : "",
    ]
      .filter(Boolean)
      .join(", ")
      .trim() || (typeof body.query === "string" ? body.query.trim() : "");

    if (!address) return badRequestResponse("address is required");

    const apiKey = getGoogleMapsApiKey();
    if (!apiKey) {
      return NextResponse.json({ error: "GOOGLE_MAPS_API_KEY is not configured" }, { status: 503 });
    }

    const result = await geocodeAddress(address, apiKey);
    if (!result) return NextResponse.json({ error: "Address not found" }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message.includes("disabled")) {
      return forbiddenResponse(error.message);
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return badRequestResponse(error instanceof Error ? error.message : "Geocode failed");
  }
}
