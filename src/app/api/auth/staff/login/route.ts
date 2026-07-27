import { NextRequest, NextResponse } from "next/server";
import { AuthMfaPurpose } from "@prisma/client";
import { beginStaffPasswordLogin } from "@/lib/staff-auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = String(body.email ?? "");
    const password = String(body.password ?? "");
    const companyId = body.companyId ? String(body.companyId) : null;
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

    const result = await beginStaffPasswordLogin(email, password, purpose, companyId);
    if (!result.ok) {
      const status = result.code === "INVALID" ? 401 : 400;
      return NextResponse.json({ error: result.error, code: result.code }, { status });
    }

    if ("needsCompanyChoice" in result) {
      return NextResponse.json({
        needsCompanyChoice: true,
        companies: result.companies,
      });
    }

    if (result.mfaRequired) {
      return NextResponse.json({
        mfaRequired: true,
        challengeId: result.challengeId,
        phoneMasked: result.phoneMasked,
        ...(result.debugCode ? { debugCode: result.debugCode } : {}),
      });
    }

    return NextResponse.json({
      mfaRequired: false,
      appleDemo: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        companyId: result.user.companyId,
        role: result.user.role,
      },
    });
  } catch (error) {
    console.error("[auth/staff/login]", error);
    return NextResponse.json({ error: "Sign in failed." }, { status: 500 });
  }
}
