import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { unregisterMobilePushDevice } from "@/lib/mobile-push/devices";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request);
    const body = (await request.json()) as { deviceToken?: string };
    const deviceToken = String(body.deviceToken ?? "").trim();
    if (!deviceToken) {
      return badRequestResponse("deviceToken is required");
    }

    await unregisterMobilePushDevice({ userId: user.id, deviceToken });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Mobile push unregister failed", error);
    return NextResponse.json({ error: "Unregister failed" }, { status: 500 });
  }
}
