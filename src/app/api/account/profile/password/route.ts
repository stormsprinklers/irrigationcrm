import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { AuthMfaPurpose } from "@prisma/client";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { validateEmployeePassword } from "@/lib/employees";
import { prisma } from "@/lib/prisma";
import {
  getStaffAuthUserForSession,
  startStaffMfaChallenge,
  verifyStaffMfaChallenge,
} from "@/lib/staff-auth";

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await requireSessionUser();
    const user = await getStaffAuthUserForSession(sessionUser);
    if (!user) return unauthorizedResponse();

    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "start");

    if (action === "start") {
      const result = await startStaffMfaChallenge(user, AuthMfaPurpose.ACCOUNT_PASSWORD);
      if (!result.ok) {
        return NextResponse.json({ error: result.error, code: result.code }, { status: 400 });
      }
      return NextResponse.json({
        challengeId: result.challengeId,
        phoneMasked: result.phoneMasked,
        ...(result.debugCode ? { debugCode: result.debugCode } : {}),
      });
    }

    if (action === "change") {
      const challengeId = String(body.challengeId ?? "").trim();
      const code = String(body.code ?? "").trim();
      const password = typeof body.password === "string" ? body.password : "";
      const confirmPassword =
        typeof body.confirmPassword === "string" ? body.confirmPassword : "";

      if (!challengeId || !code) {
        return badRequestResponse("Verification code is required");
      }

      const passwordError = validateEmployeePassword(password);
      if (passwordError) return badRequestResponse(passwordError);
      if (password !== confirmPassword) {
        return badRequestResponse("Passwords do not match");
      }

      const verified = await verifyStaffMfaChallenge(
        challengeId,
        code,
        AuthMfaPurpose.ACCOUNT_PASSWORD
      );
      if (!verified.ok) {
        return NextResponse.json({ error: verified.error }, { status: 400 });
      }
      if (verified.user.id !== user.id) {
        return forbiddenResponse();
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const siblings = await prisma.user.findMany({
        where: {
          email: user.email.toLowerCase(),
          status: "ACTIVE",
          systemKind: null,
        },
        select: { id: true },
      });

      await prisma.$transaction(
        siblings.map((sib) =>
          prisma.user.update({
            where: { id: sib.id },
            data: { passwordHash },
          })
        )
      );

      return NextResponse.json({ ok: true });
    }

    return badRequestResponse('action must be "start" or "change"');
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json({ error: "Failed to change password" }, { status: 500 });
  }
}
