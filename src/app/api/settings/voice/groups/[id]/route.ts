import { NextRequest, NextResponse } from "next/server";
import { RingStrategy } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, ringStrategy, ringTimeoutSec, memberUserIds } = body as {
      name?: string;
      ringStrategy?: RingStrategy;
      ringTimeoutSec?: number;
      memberUserIds?: string[];
    };

    if (memberUserIds) {
      await prisma.agentGroupMember.deleteMany({ where: { groupId: id } });
      await prisma.agentGroupMember.createMany({
        data: memberUserIds.map((userId, index) => ({
          groupId: id,
          userId,
          sortOrder: index,
        })),
      });
    }

    const group = await prisma.agentGroup.update({
      where: { id, companyId: user.companyId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(ringStrategy !== undefined ? { ringStrategy } : {}),
        ...(ringTimeoutSec !== undefined ? { ringTimeoutSec } : {}),
      },
      include: { members: { include: { user: { select: { id: true, name: true } } } } },
    });

    return NextResponse.json(group);
  } catch {
    return unauthorizedResponse();
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    await prisma.agentGroup.delete({ where: { id, companyId: user.companyId } });
    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
