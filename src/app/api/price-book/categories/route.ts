import { NextRequest, NextResponse } from "next/server";
import type { PriceBookItemType, UserRole } from "@prisma/client";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManagePriceBook } from "@/lib/price-book/permissions";
import { listRootCategories, slugify } from "@/lib/price-book/queries";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const type = (request.nextUrl.searchParams.get("type") ?? "SERVICE") as PriceBookItemType;
    const parentId = request.nextUrl.searchParams.get("parentId");

    if (parentId) {
      const categories = await prisma.priceBookCategory.findMany({
        where: { companyId: user.companyId, type, parentId },
        orderBy: { sortOrder: "asc" },
        include: { _count: { select: { items: true, children: true } } },
      });
      return NextResponse.json(categories);
    }

    const categories = await listRootCategories(user.companyId, type);
    return NextResponse.json(categories);
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManagePriceBook(user.role as UserRole)) return forbiddenResponse();

    const body = await request.json();
    if (!body.name?.trim()) return badRequestResponse("name is required");

    const type = (body.type ?? "SERVICE") as PriceBookItemType;
    const parentId = body.parentId ?? null;
    const baseSlug = parentId
      ? `${(
          await prisma.priceBookCategory.findFirst({ where: { id: parentId, companyId: user.companyId } })
        )?.slug ?? type.toLowerCase()}`
      : type.toLowerCase();

    const category = await prisma.priceBookCategory.create({
      data: {
        companyId: user.companyId,
        type,
        name: String(body.name).trim(),
        slug: `${baseSlug}-${slugify(String(body.name))}`,
        parentId,
        sortOrder: body.sortOrder ?? 0,
      },
      include: { _count: { select: { items: true, children: true } } },
    });

    return NextResponse.json(category, { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
