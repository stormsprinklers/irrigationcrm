import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getItem } from "@/lib/price-book/queries";
import { canManagePriceBook } from "@/lib/price-book/permissions";
import { recalculateItemPrice } from "@/lib/price-book/pricing";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManagePriceBook(user.role as UserRole)) return forbiddenResponse();

    const { id } = await params;
    const source = await prisma.priceBookItem.findFirst({
      where: { id, category: { companyId: user.companyId } },
      include: {
        serviceMaterials: true,
      },
    });
    if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const duplicate = await prisma.priceBookItem.create({
      data: {
        categoryId: source.categoryId,
        type: source.type,
        name: `${source.name} (copy)`,
        description: source.description,
        sku: source.sku ? `${source.sku}-copy` : null,
        imageUrl: source.imageUrl,
        unitPrice: source.unitPrice,
        unitCost: source.unitCost,
        unit: source.unit,
        taxable: source.taxable,
        markupEnabled: source.markupEnabled,
        laborRate: source.laborRate,
        laborRateId: source.laborRateId,
        laborHours: source.laborHours,
        pricingMode: source.pricingMode,
        lastCalculatedPrice: source.lastCalculatedPrice,
        trackMaterials: source.trackMaterials,
        active: true,
        sortOrder: source.sortOrder + 1,
        serviceMaterials:
          source.type === "SERVICE" && source.serviceMaterials.length
            ? {
                create: source.serviceMaterials.map((link) => ({
                  materialItemId: link.materialItemId,
                  quantity: link.quantity,
                })),
              }
            : undefined,
      },
    });

    await recalculateItemPrice(duplicate.id);
    const item = await getItem(user.companyId, duplicate.id);
    return NextResponse.json(item, { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
