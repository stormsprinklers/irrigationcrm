import { NextRequest, NextResponse } from "next/server";
import { EmployeeStatus } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

/**
 * Validates that the current user may switch into the target user account.
 * Client then calls next-auth `update()` with the returned session payload.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const targetUserId = String(body.userId ?? "");
    if (!targetUserId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }
    if (targetUserId === user.id) {
      return NextResponse.json({ error: "Already on this account" }, { status: 400 });
    }

    const link = await prisma.userAccountLink.findUnique({
      where: {
        userId_linkedUserId: { userId: user.id, linkedUserId: targetUserId },
      },
    });
    if (!link) {
      return NextResponse.json({ error: "Account not linked" }, { status: 403 });
    }

    const target = await prisma.user.findFirst({
      where: { id: targetUserId, status: EmployeeStatus.ACTIVE },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        companyId: true,
        company: { select: { name: true } },
      },
    });
    if (!target) {
      return NextResponse.json({ error: "Target user inactive" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      session: {
        id: target.id,
        email: target.email,
        name: target.name,
        companyId: target.companyId,
        role: target.role,
        companyName: target.company.name,
      },
    });
  } catch {
    return unauthorizedResponse();
  }
}
