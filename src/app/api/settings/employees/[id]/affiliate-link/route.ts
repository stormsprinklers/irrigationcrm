import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { createAffiliateSignInLink } from "@/lib/affiliate/sign-in";
import { canManageEmployees } from "@/lib/employees";
import { prisma } from "@/lib/prisma";
import { writeSecurityAuditEvent } from "@/lib/security/audit";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const actor = await requireSessionUser();
    if (!canManageEmployees(actor.role)) return forbiddenResponse();
    const { id } = await params;

    const affiliate = await prisma.user.findFirst({
      where: {
        id,
        companyId: actor.companyId,
        role: UserRole.AFFILIATE,
        status: "ACTIVE",
        systemKind: null,
      },
      select: { id: true },
    });
    if (!affiliate) {
      return NextResponse.json({ error: "Active affiliate account not found" }, { status: 404 });
    }

    const link = await createAffiliateSignInLink(affiliate.id, request.nextUrl.origin);
    await writeSecurityAuditEvent({
      event: "AFFILIATE_SIGN_IN_LINK_CREATED",
      outcome: "SUCCESS",
      request,
      companyId: actor.companyId,
      actorId: actor.id,
      resourceType: "User",
      resourceId: affiliate.id,
      metadata: { expiresAt: link.expiresAt.toISOString() },
    });

    return NextResponse.json({ signInUrl: link.url, expiresAt: link.expiresAt });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json({ error: "Could not create affiliate sign-in link" }, { status: 500 });
  }
}
