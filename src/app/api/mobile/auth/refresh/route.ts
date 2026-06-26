import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse } from "@/lib/api-auth";
import { rotateMobileSession } from "@/lib/mobile-auth/session";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const refreshToken = String(body.refreshToken ?? "").trim();
    if (!refreshToken) {
      return badRequestResponse("refreshToken is required");
    }

    const result = await rotateMobileSession(refreshToken);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }

    return NextResponse.json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        companyId: result.user.companyId,
        role: result.user.role,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Refresh failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
