import { NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageEmployees } from "@/lib/employees";
import { listFieldDeviceLocations } from "@/lib/field-devices";
import { buildMapsPinEmbedUrl, getGoogleMapsApiKey } from "@/lib/customers/maps";

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (!canManageEmployees(user.role)) return forbiddenResponse();

    const devices = await listFieldDeviceLocations(user.companyId);
    const apiKey = getGoogleMapsApiKey();

    return NextResponse.json({
      devices: devices.map((device) => ({
        ...device,
        mapEmbedUrl:
          apiKey && Number.isFinite(device.lat) && Number.isFinite(device.lng)
            ? buildMapsPinEmbedUrl(device.lat, device.lng, apiKey, 15)
            : null,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Field devices list error:", error);
    return NextResponse.json({ error: "Failed to load field devices" }, { status: 500 });
  }
}
