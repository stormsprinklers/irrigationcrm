import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageCustomers } from "@/lib/customers/permissions";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();

    const staff = await prisma.user.findMany({
      where: { companyId: user.companyId, appleDemoAccount: false },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        onlineBookingEnabled: true,
      },
      orderBy: [{ status: "asc" }, { firstName: "asc" }, { lastName: "asc" }],
    });

    return NextResponse.json({ staff });
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();

    const body = await request.json();
    const enabledUserIds = Array.isArray(body.enabledUserIds)
      ? body.enabledUserIds.filter((id: unknown) => typeof id === "string")
      : null;
    if (!enabledUserIds) {
      return NextResponse.json({ error: "enabledUserIds is required" }, { status: 400 });
    }

    await prisma.$transaction([
      prisma.user.updateMany({
        where: { companyId: user.companyId, onlineBookingEnabled: true },
        data: { onlineBookingEnabled: false },
      }),
      ...(enabledUserIds.length
        ? [
            prisma.user.updateMany({
              where: { companyId: user.companyId, id: { in: enabledUserIds } },
              data: { onlineBookingEnabled: true },
            }),
          ]
        : []),
    ]);

    const staff = await prisma.user.findMany({
      where: { companyId: user.companyId, appleDemoAccount: false },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        onlineBookingEnabled: true,
      },
      orderBy: [{ status: "asc" }, { firstName: "asc" }, { lastName: "asc" }],
    });

    return NextResponse.json({ staff });
  } catch {
    return unauthorizedResponse();
  }
}
