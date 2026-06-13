import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageEmployees } from "@/lib/employees";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const areas = await prisma.serviceArea.findMany({
      where: { companyId: user.companyId },
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { zips: true, visits: true } } },
    });
    return NextResponse.json(areas);
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageEmployees(user.role)) return forbiddenResponse();

    const body = await request.json();
    const { name, slug, color, sortOrder } = body;
    if (!name || !slug) return badRequestResponse("Name and slug are required");

    const area = await prisma.serviceArea.create({
      data: {
        companyId: user.companyId,
        name: String(name),
        slug: String(slug).toLowerCase().replace(/\s+/g, "-"),
        color: color ?? "#2563EB",
        sortOrder: sortOrder ?? 0,
      },
    });

    return NextResponse.json(area, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json({ error: "Failed to create service area" }, { status: 500 });
  }
}
