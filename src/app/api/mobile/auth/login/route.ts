import { NextRequest, NextResponse } from "next/server";
import { AuthMfaPurpose } from "@prisma/client";
import { badRequestResponse } from "@/lib/api-auth";
import { authenticateMobileUser, issueMobileSession } from "@/lib/mobile-auth/session";
import { startStaffMfaChallenge } from "@/lib/staff-auth";
import { enforceAuthRateLimit } from "@/lib/security/rate-limit";
import { writeSecurityAuditEvent } from "@/lib/security/audit";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = String(body.email ?? "").trim();
    const password = String(body.password ?? "");
    const companyId = body.companyId ? String(body.companyId) : null;
    const deviceName = body.deviceName ? String(body.deviceName).slice(0, 120) : undefined;

    if (!email || !password) {
      return badRequestResponse("email and password are required");
    }

    const limited = await enforceAuthRateLimit(
      request,
      "password-login",
      `${email}:${companyId ?? "any"}`
    );
    if (limited) return limited;

    const result = await authenticateMobileUser(email, password, companyId);
    if ("error" in result) {
      if ("needsCompanyChoice" in result && result.needsCompanyChoice) {
        await writeSecurityAuditEvent({
          event: "AUTH_PASSWORD_LOGIN",
          outcome: "CHALLENGE",
          request,
          subject: email,
          audience: "mobile",
          metadata: { next: "company-choice" },
        });
        return NextResponse.json({
          needsCompanyChoice: true,
          companies: result.companies,
        });
      }
      const message = result.error ?? "Invalid email or password";
      const status =
        message.includes("technicians and admins") || message.includes("Storm CRM staff")
          ? 403
          : 401;
      await writeSecurityAuditEvent({
        event: "AUTH_PASSWORD_LOGIN",
        outcome: status === 403 ? "DENIED" : "FAILURE",
        request,
        companyId,
        subject: email,
        audience: "mobile",
        metadata: { status },
      });
      return NextResponse.json({ error: message }, { status });
    }

    // Apple App Store demo technician — skip SMS MFA.
    if (result.user.appleDemoAccount) {
      const tokens = await issueMobileSession({
        userId: result.user.id,
        companyId: result.user.companyId,
        role: result.user.role,
        deviceName,
      });
      await writeSecurityAuditEvent({
        event: "AUTH_PASSWORD_LOGIN",
        outcome: "SUCCESS",
        request,
        companyId: result.user.companyId,
        actorId: result.user.id,
        subject: email,
        audience: "mobile",
        metadata: { appleDemo: true },
      });
      return NextResponse.json({
        mfaRequired: false,
        appleDemo: true,
        ...tokens,
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          companyId: result.user.companyId,
          role: result.user.role,
        },
      });
    }

    const mfa = await startStaffMfaChallenge(result.user, AuthMfaPurpose.MOBILE_LOGIN);
    if (!mfa.ok) {
      return NextResponse.json({ error: mfa.error, code: mfa.code }, { status: 400 });
    }

    await writeSecurityAuditEvent({
      event: "AUTH_PASSWORD_LOGIN",
      outcome: "CHALLENGE",
      request,
      companyId: result.user.companyId,
      actorId: result.user.id,
      subject: email,
      audience: "mobile",
      metadata: { next: "mfa" },
    });

    return NextResponse.json({
      mfaRequired: true,
      challengeId: mfa.challengeId,
      phoneMasked: mfa.phoneMasked,
      destinationMasked: mfa.destinationMasked,
      channel: mfa.channel,
      ...(mfa.debugCode ? { debugCode: mfa.debugCode } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
