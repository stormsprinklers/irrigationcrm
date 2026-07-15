import { NextRequest, NextResponse } from "next/server";
import { requestPasswordReset, resetStaffPassword } from "@/lib/staff-auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = String(body.email ?? "");
    if (!email.trim()) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }
    await requestPasswordReset(email);
    return NextResponse.json({
      ok: true,
      message: "If an account exists for that email, a reset link has been sent.",
    });
  } catch (error) {
    console.error("[auth/staff/forgot-password]", error);
    return NextResponse.json(
      { error: "Could not start password reset. Try again later." },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const token = String(body.token ?? "");
    const password = String(body.password ?? "");
    if (!token || !password) {
      return NextResponse.json(
        { error: "Token and new password are required." },
        { status: 400 },
      );
    }
    const result = await resetStaffPassword(token, password);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[auth/staff/reset-password]", error);
    return NextResponse.json({ error: "Could not reset password." }, { status: 500 });
  }
}
