import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

function forbid(role: string) {
  return role !== "ADMIN" && role !== "MANAGER";
}

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (forbid(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const sections = await prisma.techAssistPartSection.findMany({
      where: { companyId: user.companyId },
      include: {
        _count: { select: { parts: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return NextResponse.json({
      sections: sections.map((section) => ({
        id: section.id,
        name: section.name,
        sortOrder: section.sortOrder,
        partCount: section._count.parts,
      })),
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (forbid(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = (await request.json()) as { name?: string };
    const name = body.name?.trim();
    if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
    const count = await prisma.techAssistPartSection.count({
      where: { companyId: user.companyId },
    });
    const section = await prisma.techAssistPartSection.create({
      data: {
        companyId: user.companyId,
        name,
        sortOrder: count,
      },
    });
    return NextResponse.json(section, { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
