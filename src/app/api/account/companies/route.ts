import { NextRequest, NextResponse } from "next/server";
import { EmployeeStatus } from "@prisma/client";
import {
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type SwitchableAccount = {
  userId: string;
  name: string;
  email: string;
  role: string;
  companyId: string;
  companyName: string;
  source: "same-email" | "linked";
};

async function listSwitchableAccounts(
  userId: string,
  email: string,
  companyId: string
): Promise<SwitchableAccount[]> {
  const byId = new Map<string, SwitchableAccount>();

  const sameEmail = await prisma.user.findMany({
    where: {
      email: email.toLowerCase(),
      status: EmployeeStatus.ACTIVE,
      systemKind: null,
      NOT: { id: userId },
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      company: { select: { id: true, name: true } },
    },
  });

  for (const u of sameEmail) {
    byId.set(u.id, {
      userId: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      companyId: u.company.id,
      companyName: u.company.name,
      source: "same-email",
    });
  }

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

  for (const l of links) {
    if (l.linkedUser.status !== EmployeeStatus.ACTIVE) continue;
    if (l.linkedUser.company.id === companyId) continue;
    if (byId.has(l.linkedUser.id)) continue;
    byId.set(l.linkedUser.id, {
      userId: l.linkedUser.id,
      name: l.linkedUser.name,
      email: l.linkedUser.email,
      role: l.linkedUser.role,
      companyId: l.linkedUser.company.id,
      companyName: l.linkedUser.company.name,
      source: "linked",
    });
  }

  return Array.from(byId.values()).sort((a, b) =>
    a.companyName.localeCompare(b.companyName)
  );
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

    const switchable = await listSwitchableAccounts(
      current.id,
      current.email,
      current.company.id
    );

    return NextResponse.json({
      current: {
        userId: current.id,
        name: current.name,
        email: current.email,
        role: current.role,
        companyId: current.company.id,
        companyName: current.company.name,
        source: "same-email" as const,
      },
      switchable,
      /** @deprecated use switchable */
      linked: switchable,
    });
  } catch {
    return unauthorizedResponse();
  }
}

/** Create a bidirectional account link for the signed-in user. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();

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

    const me = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true, companyId: true },
    });
    if (!me) return unauthorizedResponse();

    return NextResponse.json({
      ok: true,
      switchable: await listSwitchableAccounts(user.id, me.email, me.companyId),
    });
  } catch {
    return unauthorizedResponse();
  }
}
