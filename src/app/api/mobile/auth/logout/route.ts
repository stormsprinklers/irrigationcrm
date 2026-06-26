import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { revokeMobileSession } from "@/lib/mobile-auth/session";

export async function POST(request: NextRequest) {
  try {
    await requireSessionUser(request);
    const body = await request.json();
    const refreshToken = String(body.refreshToken ?? "").trim();
    if (!refreshToken) {
      return badRequestResponse("refreshToken is required");
    }

    await revokeMobileSession(refreshToken);
    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
