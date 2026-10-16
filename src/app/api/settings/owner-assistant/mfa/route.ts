import { AuthMfaPurpose } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api-auth";
import { requireRealAdmin } from "@/lib/owner-assistant/access";
import { issueOwnerAssistantStepUpToken } from "@/lib/owner-assistant/step-up";
import { prisma } from "@/lib/prisma";
import { startStaffMfaChallenge, verifyStaffMfaChallenge, type StaffAuthUser } from "@/lib/staff-auth";

async function admin(request: NextRequest) {
  const session = await requireSessionUser(request);
  await requireRealAdmin(session);
  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user) throw new Error("Unauthorized");
  return user as StaffAuthUser;
}

export async function POST(request: NextRequest) {
  try {
    const user = await admin(request);
    const body = await request.json().catch(() => ({}));
    if (body.action === "verify") {
      const result = await verifyStaffMfaChallenge(
        String(body.challengeId ?? ""),
        String(body.code ?? ""),
        AuthMfaPurpose.OWNER_ASSISTANT_SETTINGS
      );
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      if (result.user.id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      const actionToken = await issueOwnerAssistantStepUpToken({
        userId: user.id,
        companyId: user.companyId,
        challengeId: String(body.challengeId),
      });
      return NextResponse.json({ actionToken, expiresInSeconds: 600 });
    }
    const result = await startStaffMfaChallenge(user, AuthMfaPurpose.OWNER_ASSISTANT_SETTINGS);
    if (!result.ok) return NextResponse.json({ error: result.error, code: result.code }, { status: 400 });
    return NextResponse.json({ challengeId: result.challengeId, phoneMasked: result.phoneMasked, ...(result.debugCode ? { debugCode: result.debugCode } : {}) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json({ error: message === "FORBIDDEN" ? "Admin access required" : "Unauthorized" }, { status: message === "FORBIDDEN" ? 403 : 401 });
  }
}
