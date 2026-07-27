import { NextRequest, NextResponse } from "next/server";
import { EmployeeStatus } from "@prisma/client";
import {
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

async function listLinkedAccounts(userId: string) {
  const links = await prisma.userAccountLink.findMany({
    where: { userId },
    include: {
      linkedUser: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          company: { select: { id: true, name: true } },
        },
      },
    },
  });

  return links
    .filter((l) => l.linkedUser.status === EmployeeStatus.ACTIVE)
    .map((l) => ({
      userId: l.linkedUser.id,
      name: l.linkedUser.name,
      email: l.linkedUser.email,
      role: l.linkedUser.role,
      companyId: l.linkedUser.company.id,
      companyName: l.linkedUser.company.name,
    }));
}

export async function GET() {
  try {
    const user = await requireSessionUser();
    const current = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        company: { select: { id: true, name: true } },
      },
    });
    if (!current) return unauthorizedResponse();

    const linked = await listLinkedAccounts(user.id);
    return NextResponse.json({
      current: {
        userId: current.id,
        name: current.name,
        email: current.email,
        role: current.role,
        companyId: current.company.id,
        companyName: current.company.name,
      },
      linked,
    });
  } catch {
    return unauthorizedResponse();
  }
}

/** Create a bidirectional account link (ADMIN only). */
export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN") return forbiddenResponse();

    const body = await request.json();
    const linkedUserId = String(body.linkedUserId ?? "");
    if (!linkedUserId || linkedUserId === user.id) {
      return NextResponse.json({ error: "Invalid linkedUserId" }, { status: 400 });
    }

    const target = await prisma.user.findFirst({
      where: { id: linkedUserId, status: EmployeeStatus.ACTIVE },
      select: { id: true, companyId: true },
    });
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (target.companyId === user.companyId) {
      return NextResponse.json(
        { error: "Linked account must be on a different company" },
        { status: 400 }
      );
    }

    await prisma.$transaction([
      prisma.userAccountLink.upsert({
        where: {
          userId_linkedUserId: { userId: user.id, linkedUserId: target.id },
        },
        update: {},
        create: { userId: user.id, linkedUserId: target.id },
      }),
      prisma.userAccountLink.upsert({
        where: {
          userId_linkedUserId: { userId: target.id, linkedUserId: user.id },
        },
        update: {},
        create: { userId: target.id, linkedUserId: user.id },
      }),
    ]);

    return NextResponse.json({ ok: true, linked: await listLinkedAccounts(user.id) });
  } catch {
    return unauthorizedResponse();
  }
}
