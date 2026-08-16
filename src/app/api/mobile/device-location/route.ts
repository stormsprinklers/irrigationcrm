import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { upsertFieldDeviceLocation } from "@/lib/field-devices";

function parseCoord(value: unknown, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = (await request.json()) as Record<string, unknown>;
    const deviceId = typeof body.deviceId === "string" ? body.deviceId : "";
    const lat = parseCoord(body.lat, -90, 90);
    const lng = parseCoord(body.lng, -180, 180);
    if (!deviceId.trim() || lat == null || lng == null) {
      return badRequestResponse("deviceId, lat, and lng are required");
    }

    const heading =
      body.heading != null && Number.isFinite(Number(body.heading))
        ? Number(body.heading)
        : null;
    const accuracyMeters =
      body.accuracyMeters != null && Number.isFinite(Number(body.accuracyMeters))
        ? Number(body.accuracyMeters)
        : null;
    const deviceName = typeof body.deviceName === "string" ? body.deviceName : null;

    const result = await upsertFieldDeviceLocation({
      companyId: user.companyId,
      userId: user.id,
      deviceId,
      deviceName,
      lat,
      lng,
      heading,
      accuracyMeters,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Device location ping error:", error);
    return NextResponse.json({ error: "Failed to update device location" }, { status: 500 });
  }
}
