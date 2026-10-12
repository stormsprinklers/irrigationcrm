import { NextRequest, NextResponse } from "next/server";
import { userFromBearerToken } from "@/lib/api-auth";
import { resolveMobileCompanyAccount } from "@/lib/mobile-auth/company-switch";
import { issueMobileSession } from "@/lib/mobile-auth/session";

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const current = bearer ? await userFromBearerToken(bearer) : null;
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const targetId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!targetId || targetId === current.id) {
    return NextResponse.json({ error: "Choose a different company account" }, { status: 400 });
  }
  const target = await resolveMobileCompanyAccount(current.id, targetId);
  if (!target || target.companyId === current.companyId) {
    return NextResponse.json({ error: "This company account is not available" }, { status: 403 });
  }
  const tokens = await issueMobileSession({
    userId: target.id, companyId: target.companyId, role: target.role,
    deviceName: typeof body.deviceName === "string" ? body.deviceName.slice(0, 120) : undefined,
  });
  return NextResponse.json({ ...tokens, user: target }, { headers: { "Cache-Control": "no-store" } });
}
