import { NextRequest, NextResponse } from "next/server";
import { AuthMfaPurpose } from "@prisma/client";
import {
  issueLmsAuthTicket,
  startStaffMfaChallenge,
  verifyStaffMfaChallenge,
} from "@/lib/staff-auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const challengeId = String(body.challengeId ?? "");
    const code = String(body.code ?? "");
    const purposeRaw = String(body.purpose ?? "LOGIN").toUpperCase();
    const purpose =
      purposeRaw === "MOBILE_LOGIN"
        ? AuthMfaPurpose.MOBILE_LOGIN
        : purposeRaw === "LMS_LOGIN"
          ? AuthMfaPurpose.LMS_LOGIN
          : AuthMfaPurpose.LOGIN;

    if (!challengeId || !code.trim()) {
      return NextResponse.json(
        { error: "Verification code is required." },
        { status: 400 },
      );
    }

    const result = await verifyStaffMfaChallenge(challengeId, code, purpose);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }

    if (purpose === AuthMfaPurpose.LMS_LOGIN) {
      const ticket = await issueLmsAuthTicket(result.user);
      return NextResponse.json({
        ok: true,
        ticket,
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
        },
      });
    }

    // Web / mobile: client completes session with challenge credentials or
    // calls mobile token issue. Mark is already consumed; return proof fields.
    return NextResponse.json({
      ok: true,
      challengeId: result.challengeId,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        companyId: result.user.companyId,
        role: result.user.role,
      },
    });
  } catch (error) {
    console.error("[auth/staff/mfa/verify]", error);
    return NextResponse.json({ error: "Verification failed." }, { status: 500 });
  }
}

/** Resend a new code for the same user (requires previous challenge id). */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const challengeId = String(body.challengeId ?? "");
    const purposeRaw = String(body.purpose ?? "LOGIN").toUpperCase();
    const purpose =
      purposeRaw === "MOBILE_LOGIN"
        ? AuthMfaPurpose.MOBILE_LOGIN
        : purposeRaw === "LMS_LOGIN"
          ? AuthMfaPurpose.LMS_LOGIN
          : AuthMfaPurpose.LOGIN;

    const { prisma } = await import("@/lib/prisma");
    const existing = await prisma.authMfaChallenge.findUnique({
      where: { id: challengeId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            companyId: true,
            role: true,
            status: true,
            passwordHash: true,
            phone: true,
            lmsUserId: true,
          },
        },
      },
    });

    if (!existing || existing.user.status !== "ACTIVE") {
      return NextResponse.json({ error: "Sign in again." }, { status: 401 });
    }

    const result = await startStaffMfaChallenge(existing.user, purpose);
    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code }, { status: 400 });
    }

    return NextResponse.json({
      challengeId: result.challengeId,
      phoneMasked: result.phoneMasked,
      ...(result.debugCode ? { debugCode: result.debugCode } : {}),
    });
  } catch (error) {
    console.error("[auth/staff/mfa/resend]", error);
    return NextResponse.json({ error: "Could not resend code." }, { status: 500 });
  }
}
