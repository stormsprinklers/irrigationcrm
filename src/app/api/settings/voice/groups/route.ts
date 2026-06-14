import { NextRequest, NextResponse } from "next/server";
import { RingStrategy } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const groups = await prisma.agentGroup.findMany({
      where: { companyId: user.companyId },
      include: {
        members: {
          orderBy: { sortOrder: "asc" },
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(groups);
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { name, ringStrategy, ringTimeoutSec, memberUserIds } = body as {
      name?: string;
      ringStrategy?: RingStrategy;
      ringTimeoutSec?: number;
      memberUserIds?: string[];
    };

    if (!name) {
      return NextResponse.json({ error: "Name required" }, { status: 400 });
    }

    const group = await prisma.agentGroup.create({
      data: {
        companyId: user.companyId,
        name,
        ringStrategy: ringStrategy ?? RingStrategy.SIMULTANEOUS,
        ringTimeoutSec: ringTimeoutSec ?? 30,
        members: {
          create: (memberUserIds ?? []).map((userId, index) => ({
            userId,
            sortOrder: index,
          })),
        },
      },
      include: { members: { include: { user: { select: { id: true, name: true } } } } },
    });

    return NextResponse.json(group, { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
