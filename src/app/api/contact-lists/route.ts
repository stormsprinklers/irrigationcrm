import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const lists = await prisma.contactList.findMany({
      where: { companyId: user.companyId },
      include: { _count: { select: { members: true } } },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({
      lists: lists.map((l) => ({
        id: l.id,
        name: l.name,
        memberCount: l._count.members,
      })),
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    if (!body.name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const list = await prisma.contactList.create({
      data: {
        companyId: user.companyId,
        name: String(body.name),
      },
    });

    return NextResponse.json(list, { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
