import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageEmployees } from "@/lib/employees";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const categories = await prisma.priceBookCategory.findMany({
      where: { companyId: user.companyId },
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { items: true } } },
    });
    return NextResponse.json(categories);
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageEmployees(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await request.json();
    const category = await prisma.priceBookCategory.create({
      data: {
        companyId: user.companyId,
        name: String(body.name),
        slug: String(body.slug ?? body.name).toLowerCase().replace(/\s+/g, "-"),
        sortOrder: body.sortOrder ?? 0,
      },
    });
    return NextResponse.json(category, { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
