import { NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { assertHolidayLightingEnabled } from "@/lib/holiday-lighting/catalog";
import { getGoogleMapsApiKey } from "@/lib/customers/maps";
import { prisma } from "@/lib/prisma";

/**
 * Browser Maps JS key for staff holiday lighting quoter.
 * Prefers NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, then falls back to GOOGLE_MAPS_API_KEY.
 */
export async function GET() {
  try {
    const user = await requireSessionUser();
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { holidayLightingFeaturesEnabled: true },
    });
    assertHolidayLightingEnabled(company ?? {});

    const key =
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY?.trim() ||
      getGoogleMapsApiKey().trim();

    if (!key) {
      return NextResponse.json({ error: "Google Maps API key is not configured" }, { status: 503 });
    }

    return NextResponse.json({ key });
  } catch (error) {
    if (error instanceof Error && error.message.includes("disabled")) {
      return forbiddenResponse(error.message);
    }
    return unauthorizedResponse();
  }
}
