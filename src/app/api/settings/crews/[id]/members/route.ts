import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageEmployees } from "@/lib/employees";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageEmployees(user.role)) return forbiddenResponse();

    const { id } = await params;
    const crew = await prisma.crew.findFirst({ where: { id, companyId: user.companyId } });
    if (!crew) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const userIds = Array.isArray(body.userIds) ? body.userIds : [];
    if (!userIds.every((uid: unknown) => typeof uid === "string")) {
      return badRequestResponse("userIds must be an array of strings");
    }

    const foremanUserId =
      typeof body.foremanUserId === "string" && body.foremanUserId
        ? body.foremanUserId
        : userIds[0] ?? null;
    if (foremanUserId && !userIds.includes(foremanUserId)) {
      return badRequestResponse("Foreman must be a crew member");
    }

    const validUsers = await prisma.user.count({
      where: { companyId: user.companyId, id: { in: userIds }, status: "ACTIVE" },
    });
    if (validUsers !== userIds.length) {
      return badRequestResponse("One or more invalid user IDs");
    }

    await prisma.$transaction(async (tx) => {
      await tx.crewMember.deleteMany({ where: { crewId: id } });
      if (userIds.length) {
        await tx.crewMember.createMany({
          data: userIds.map((userId: string) => ({ crewId: id, userId })),
        });
      }
      await tx.crew.update({
        where: { id },
        data: { foremanUserId },
      });
    });

    const updated = await prisma.crew.findUnique({
      where: { id },
      include: {
        foreman: { select: { id: true, name: true, color: true, photoUrl: true } },
        members: {
          include: { user: { select: { id: true, name: true, color: true, photoUrl: true } } },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json({ error: "Failed to update crew members" }, { status: 500 });
  }
}
