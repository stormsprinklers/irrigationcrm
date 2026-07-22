import { NextRequest, NextResponse } from "next/server";
import { AuthMfaPurpose } from "@prisma/client";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { issueExpenseCardActionToken } from "@/lib/expense-cards/action-token";
import { prisma } from "@/lib/prisma";
import {
  startStaffMfaChallenge,
  verifyStaffMfaChallenge,
  type StaffAuthUser,
} from "@/lib/staff-auth";

async function requireAdmin(): Promise<StaffAuthUser> {
  const user = await requireSessionUser();
  if (user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }
  const full = await prisma.user.findFirst({
    where: { id: user.id, companyId: user.companyId, status: "ACTIVE" },
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
  });
  if (!full) throw new Error("Unauthorized");
  return full;
}

/** Start step-up MFA for expense-card admin mutations. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin();
    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "start");

    if (action === "start") {
      const result = await startStaffMfaChallenge(user, AuthMfaPurpose.EXPENSE_CARD_ADMIN);
      if (!result.ok) {
        return NextResponse.json({ error: result.error, code: result.code }, { status: 400 });
      }
      return NextResponse.json({
        challengeId: result.challengeId,
        phoneMasked: result.phoneMasked,
        ...(result.debugCode ? { debugCode: result.debugCode } : {}),
      });
    }

    if (action === "verify") {
      const challengeId = String(body.challengeId ?? "").trim();
      const code = String(body.code ?? "").trim();
      if (!challengeId || !code) {
        return badRequestResponse("challengeId and code are required");
      }
      const verified = await verifyStaffMfaChallenge(
        challengeId,
        code,
        AuthMfaPurpose.EXPENSE_CARD_ADMIN
      );
      if (!verified.ok) {
        return NextResponse.json({ error: verified.error }, { status: 400 });
      }
      if (verified.user.id !== user.id) {
        return forbiddenResponse();
      }
      const actionToken = await issueExpenseCardActionToken({
        userId: user.id,
        companyId: user.companyId,
        challengeId,
      });
      return NextResponse.json({ actionToken, expiresInSeconds: 600 });
    }

    return badRequestResponse('action must be "start" or "verify"');
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return forbiddenResponse();
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return unauthorizedResponse();
  }
}
