import { NextRequest, NextResponse } from "next/server";
import { AuthMfaPurpose } from "@prisma/client";
import { badRequestResponse } from "@/lib/api-auth";
import { authenticateMobileUser, issueMobileSession } from "@/lib/mobile-auth/session";
import { startStaffMfaChallenge } from "@/lib/staff-auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = String(body.email ?? "").trim();
    const password = String(body.password ?? "");

    if (!email || !password) {
      return badRequestResponse("email and password are required");
    }

    const result = await authenticateMobileUser(email, password);
    if ("error" in result) {
      const message = result.error ?? "Invalid email or password";
      const status =
        message.includes("technicians and admins") || message.includes("Storm CRM staff")
          ? 403
          : 401;
      return NextResponse.json({ error: message }, { status });
    }

    const mfa = await startStaffMfaChallenge(result.user, AuthMfaPurpose.MOBILE_LOGIN);
    if (!mfa.ok) {
      return NextResponse.json({ error: mfa.error, code: mfa.code }, { status: 400 });
    }

    return NextResponse.json({
      mfaRequired: true,
      challengeId: mfa.challengeId,
      phoneMasked: mfa.phoneMasked,
      ...(mfa.debugCode ? { debugCode: mfa.debugCode } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
