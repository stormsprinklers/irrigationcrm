import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getCategory } from "@/lib/price-book/queries";
import { canManagePriceBook } from "@/lib/price-book/permissions";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const category = await getCategory(user.companyId, id);
    if (!category) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(category);
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManagePriceBook(user.role as UserRole)) return forbiddenResponse();

    const { id } = await params;
    const existing = await prisma.priceBookCategory.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const category = await prisma.priceBookCategory.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: String(body.name) } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: Number(body.sortOrder) } : {}),
      },
      include: { _count: { select: { items: true, children: true } } },
    });

    return NextResponse.json(category);
  } catch {
    return unauthorizedResponse();
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManagePriceBook(user.role as UserRole)) return forbiddenResponse();

    const { id } = await params;
    const existing = await prisma.priceBookCategory.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.priceBookCategory.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
