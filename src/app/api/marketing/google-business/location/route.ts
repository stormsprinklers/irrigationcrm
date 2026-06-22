import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageCustomers } from "@/lib/customers/permissions";
import { prisma } from "@/lib/prisma";

export async function PUT(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();

    const body = await request.json();
    const { accountId, locationId, locationTitle } = body;

    if (!locationId) return badRequestResponse("locationId is required");

    await prisma.company.update({
      where: { id: user.companyId },
      data: {
        googleBusinessAccountId: accountId ?? null,
        googleBusinessLocationId: String(locationId),
        googleBusinessLocationTitle: locationTitle ? String(locationTitle) : null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
