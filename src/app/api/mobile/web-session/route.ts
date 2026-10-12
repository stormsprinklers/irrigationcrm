import { NextRequest, NextResponse } from "next/server";
import { userFromBearerToken } from "@/lib/api-auth";
import { createMobileWebSession } from "@/lib/mobile-auth/web-session";

export async function POST(request: NextRequest) {
  // Authenticate only the native client's bearer, never an existing browser cookie.
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const user = bearer ? await userFromBearerToken(bearer) : null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await createMobileWebSession(user, request.nextUrl.protocol === "https:");
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
