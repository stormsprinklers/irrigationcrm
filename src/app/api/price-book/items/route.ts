import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageEmployees } from "@/lib/employees";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const q = request.nextUrl.searchParams.get("q")?.trim();
    const categoryId = request.nextUrl.searchParams.get("categoryId");

    const items = await prisma.priceBookItem.findMany({
      where: {
        active: true,
        category: { companyId: user.companyId },
        ...(categoryId ? { categoryId } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
      include: { category: { select: { id: true, name: true, slug: true } } },
    });

    return NextResponse.json(items);
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
    if (!body.categoryId || !body.name) {
      return badRequestResponse("categoryId and name are required");
    }

    const category = await prisma.priceBookCategory.findFirst({
      where: { id: body.categoryId, companyId: user.companyId },
    });
    if (!category) return NextResponse.json({ error: "Category not found" }, { status: 404 });

    const item = await prisma.priceBookItem.create({
      data: {
        categoryId: body.categoryId,
        name: String(body.name),
        description: body.description ?? null,
        unitPrice: Number(body.unitPrice ?? 0),
        unit: body.unit ?? "each",
        active: body.active ?? true,
        sortOrder: body.sortOrder ?? 0,
      },
      include: { category: { select: { id: true, name: true, slug: true } } },
    });

    return NextResponse.json(item, { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageEmployees(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    if (!body.id) return badRequestResponse("id is required");

    const existing = await prisma.priceBookItem.findFirst({
      where: { id: body.id, category: { companyId: user.companyId } },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const item = await prisma.priceBookItem.update({
      where: { id: body.id },
      data: {
        ...(body.name !== undefined ? { name: String(body.name) } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.unitPrice !== undefined ? { unitPrice: Number(body.unitPrice) } : {}),
        ...(body.unit !== undefined ? { unit: String(body.unit) } : {}),
        ...(body.active !== undefined ? { active: Boolean(body.active) } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: Number(body.sortOrder) } : {}),
      },
      include: { category: { select: { id: true, name: true, slug: true } } },
    });

    return NextResponse.json(item);
  } catch {
    return unauthorizedResponse();
  }
}
