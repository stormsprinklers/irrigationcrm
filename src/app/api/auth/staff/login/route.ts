import { NextRequest, NextResponse } from "next/server";
import { AuthMfaPurpose } from "@prisma/client";
import { beginStaffPasswordLogin } from "@/lib/staff-auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = String(body.email ?? "");
    const password = String(body.password ?? "");
    const purposeRaw = String(body.purpose ?? "LOGIN").toUpperCase();
    const purpose =
      purposeRaw === "MOBILE_LOGIN"
        ? AuthMfaPurpose.MOBILE_LOGIN
        : purposeRaw === "LMS_LOGIN"
          ? AuthMfaPurpose.LMS_LOGIN
          : AuthMfaPurpose.LOGIN;

    if (!email.trim() || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const result = await beginStaffPasswordLogin(email, password, purpose);
    if (!result.ok) {
      const status = result.code === "INVALID" ? 401 : 400;
      return NextResponse.json({ error: result.error, code: result.code }, { status });
    }

    return NextResponse.json({
      mfaRequired: true,
      challengeId: result.challengeId,
      phoneMasked: result.phoneMasked,
      ...(result.debugCode ? { debugCode: result.debugCode } : {}),
    });
  } catch (error) {
    console.error("[auth/staff/login]", error);
    return NextResponse.json({ error: "Sign in failed." }, { status: 500 });
  }
}
