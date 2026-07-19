import { NextRequest, NextResponse } from "next/server";
import { AuthMfaPurpose } from "@prisma/client";
import { badRequestResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { startStaffMfaChallenge } from "@/lib/staff-auth";

/** Resend MFA code for an in-progress mobile login challenge. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const challengeId = String(body.challengeId ?? "");
    if (!challengeId) {
      return badRequestResponse("challengeId is required");
    }

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
            appleDemoAccount: true,
          },
        },
      },
    });

    if (
      !existing ||
      existing.purpose !== AuthMfaPurpose.MOBILE_LOGIN ||
      existing.user.status !== "ACTIVE"
    ) {
      return NextResponse.json({ error: "Sign in again." }, { status: 401 });
    }

    const result = await startStaffMfaChallenge(
      existing.user,
      AuthMfaPurpose.MOBILE_LOGIN
    );
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: 400 }
      );
    }

    return NextResponse.json({
      challengeId: result.challengeId,
      phoneMasked: result.phoneMasked,
      ...(result.debugCode ? { debugCode: result.debugCode } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not resend code";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
