import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { registerMobilePushDevice } from "@/lib/mobile-push/devices";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request);
    const body = (await request.json()) as {
      deviceToken?: string;
      platform?: string;
      bundleId?: string;
    };

    const deviceToken = String(body.deviceToken ?? "").trim();
    if (!deviceToken) {
      return badRequestResponse("deviceToken is required");
    }

    await registerMobilePushDevice({
      userId: user.id,
      companyId: user.companyId,
      deviceToken,
      platform: body.platform ? String(body.platform).slice(0, 20) : "ios",
      bundleId: body.bundleId ? String(body.bundleId).slice(0, 120) : null,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Mobile push register failed", error);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
