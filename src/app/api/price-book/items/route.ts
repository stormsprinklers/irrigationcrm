import { NextRequest, NextResponse } from "next/server";
import type { PriceBookItemType, PriceBookPricingMode, UserRole } from "@prisma/client";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getItem, listItems, upsertItemMaterials } from "@/lib/price-book/queries";
import { canManagePriceBook } from "@/lib/price-book/permissions";
import { recalculateItemPrice } from "@/lib/price-book/pricing";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const q = request.nextUrl.searchParams.get("q")?.trim();
    const categoryId = request.nextUrl.searchParams.get("categoryId") ?? undefined;
    const type = request.nextUrl.searchParams.get("type") as PriceBookItemType | null;
    const activeOnly = request.nextUrl.searchParams.get("activeOnly") !== "false";

    const items = await listItems({
      companyId: user.companyId,
      q: q ?? undefined,
      categoryId,
      type: type ?? undefined,
      activeOnly,
    });

    return NextResponse.json(items);
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManagePriceBook(user.role as UserRole)) return forbiddenResponse();

    const body = await request.json();
    if (!body.categoryId || !body.name) {
      return badRequestResponse("categoryId and name are required");
    }

    const category = await prisma.priceBookCategory.findFirst({
      where: { id: body.categoryId, companyId: user.companyId },
    });
    if (!category) return NextResponse.json({ error: "Category not found" }, { status: 404 });

    const type = (body.type ?? category.type) as PriceBookItemType;
    const pricingMode = (body.pricingMode ?? "CALCULATED") as PriceBookPricingMode;

    const item = await prisma.priceBookItem.create({
      data: {
        categoryId: body.categoryId,
        type,
        name: String(body.name),
        description: body.description ?? null,
        sku: body.sku ?? null,
        imageUrl: body.imageUrl ?? null,
        unitPrice: Number(body.unitPrice ?? 0),
        unitCost: body.unitCost != null ? Number(body.unitCost) : null,
        unit: body.unit ?? "each",
        taxable: Boolean(body.taxable),
        markupEnabled: Boolean(body.markupEnabled),
        laborRate: body.laborRate != null ? Number(body.laborRate) : null,
        laborRateId: body.laborRateId ?? null,
        laborHours: body.laborHours != null ? Number(body.laborHours) : null,
        pricingMode,
        trackMaterials: Boolean(body.trackMaterials),
        active: body.active ?? true,
        sortOrder: body.sortOrder ?? 0,
      },
    });

    if (type === "SERVICE" && Array.isArray(body.materials)) {
      await upsertItemMaterials(
        item.id,
        body.materials.map((m: { materialItemId: string; quantity?: number }) => ({
          materialItemId: m.materialItemId,
          quantity: Number(m.quantity ?? 1),
        }))
      );
    }

    await recalculateItemPrice(item.id);

    const full = await getItem(user.companyId, item.id);
    return NextResponse.json(full, { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
