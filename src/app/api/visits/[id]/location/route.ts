import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { requireFieldVisitAccess } from "@/lib/field/visit-guard";
import { recordLiveLocationPing } from "@/lib/visits/live-tracking";

type Params = { params: Promise<{ id: string }> };

function parseCoord(value: unknown, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const access = await requireFieldVisitAccess(user, id);
    if (!access.ok) return access.response;

    const body = (await request.json()) as Record<string, unknown>;
    const lat = parseCoord(body.lat ?? body.originLat, -90, 90);
    const lng = parseCoord(body.lng ?? body.originLng, -180, 180);
    if (lat == null || lng == null) {
      return badRequestResponse("lat and lng are required");
    }

    const heading =
      body.heading != null && Number.isFinite(Number(body.heading))
        ? Number(body.heading)
        : null;
    const speedMps =
      body.speedMps != null && Number.isFinite(Number(body.speedMps))
        ? Number(body.speedMps)
        : null;

    const result = await recordLiveLocationPing({
      companyId: user.companyId,
      visitId: id,
      lat,
      lng,
      heading,
      speedMps,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Visit location ping error:", error);
    return NextResponse.json({ error: "Failed to update location" }, { status: 500 });
  }
}
