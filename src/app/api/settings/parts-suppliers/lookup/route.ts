import { NextRequest, NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { canManageEmployees } from "@/lib/employees";
import { extractPlaceIdFromInput, searchPlaces } from "@/lib/parts-suppliers/places";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageEmployees(user.role)) return forbiddenResponse();

    const body = await request.json();
    const query = String(body.query ?? "").trim();
    if (!query) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    const placeId = extractPlaceIdFromInput(query);
    if (placeId) {
      const { getPlaceDetails } = await import("@/lib/parts-suppliers/places");
      const place = await getPlaceDetails(placeId);
      return NextResponse.json({ results: [place] });
    }

    const results = await searchPlaces(query);
    return NextResponse.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lookup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
