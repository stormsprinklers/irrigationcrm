import { NextRequest, NextResponse } from "next/server";
import { AuthMfaPurpose } from "@prisma/client";
import { badRequestResponse } from "@/lib/api-auth";
import { canAccessMobileApp } from "@/lib/employees";
import { issueMobileSession } from "@/lib/mobile-auth/session";
import { verifyStaffMfaChallenge } from "@/lib/staff-auth";
import { enforceAuthRateLimit } from "@/lib/security/rate-limit";
import { writeSecurityAuditEvent } from "@/lib/security/audit";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const challengeId = String(body.challengeId ?? "");
    const code = String(body.code ?? "");
    const deviceName = body.deviceName ? String(body.deviceName).slice(0, 120) : undefined;

    if (!challengeId || !code.trim()) {
      return badRequestResponse("challengeId and code are required");
    }

    const limited = await enforceAuthRateLimit(request, "mfa-verify", challengeId);
    if (limited) return limited;

    const result = await verifyStaffMfaChallenge(
      challengeId,
      code,
      AuthMfaPurpose.MOBILE_LOGIN,
    );
    if (!result.ok) {
      await writeSecurityAuditEvent({
        event: "AUTH_MFA_VERIFY",
        outcome: "FAILURE",
        request,
        subject: challengeId,
        audience: "mobile",
      });
      return NextResponse.json({ error: result.error }, { status: 401 });
    }
    if (!canAccessMobileApp(result.user.role)) {
      return NextResponse.json(
        { error: "This app is for Storm CRM staff only" },
        { status: 403 },
      );
    }

    const tokens = await issueMobileSession({
      userId: result.user.id,
      companyId: result.user.companyId,
      role: result.user.role,
      deviceName,
    });

    await writeSecurityAuditEvent({
      event: "AUTH_MFA_VERIFY",
      outcome: "SUCCESS",
      request,
      companyId: result.user.companyId,
      actorId: result.user.id,
      subject: challengeId,
      audience: "mobile",
    });

    return NextResponse.json({
      ...tokens,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        companyId: result.user.companyId,
        role: result.user.role,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Verification failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
