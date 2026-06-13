import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getItem, upsertItemMaterials } from "@/lib/price-book/queries";
import { canManagePriceBook } from "@/lib/price-book/permissions";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const item = await getItem(user.companyId, id);
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(item);
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManagePriceBook(user.role as UserRole)) return forbiddenResponse();

    const { id } = await params;
    const existing = await prisma.priceBookItem.findFirst({
      where: { id, category: { companyId: user.companyId } },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    await prisma.priceBookItem.update({
      where: { id },
      data: {
        ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
        ...(body.name !== undefined ? { name: String(body.name) } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.sku !== undefined ? { sku: body.sku } : {}),
        ...(body.unitPrice !== undefined ? { unitPrice: Number(body.unitPrice) } : {}),
        ...(body.unitCost !== undefined ? { unitCost: body.unitCost != null ? Number(body.unitCost) : null } : {}),
        ...(body.unit !== undefined ? { unit: String(body.unit) } : {}),
        ...(body.taxable !== undefined ? { taxable: Boolean(body.taxable) } : {}),
        ...(body.markupEnabled !== undefined ? { markupEnabled: Boolean(body.markupEnabled) } : {}),
        ...(body.laborRate !== undefined ? { laborRate: body.laborRate != null ? Number(body.laborRate) : null } : {}),
        ...(body.laborHours !== undefined ? { laborHours: body.laborHours != null ? Number(body.laborHours) : null } : {}),
        ...(body.trackMaterials !== undefined ? { trackMaterials: Boolean(body.trackMaterials) } : {}),
        ...(body.active !== undefined ? { active: Boolean(body.active) } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: Number(body.sortOrder) } : {}),
      },
    });

    if (existing.type === "SERVICE" && Array.isArray(body.materials)) {
      await upsertItemMaterials(
        id,
        body.materials.map((m: { materialItemId: string; quantity?: number }) => ({
          materialItemId: m.materialItemId,
          quantity: Number(m.quantity ?? 1),
        }))
      );
    }

    const item = await getItem(user.companyId, id);
    return NextResponse.json(item);
  } catch {
    return unauthorizedResponse();
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManagePriceBook(user.role as UserRole)) return forbiddenResponse();

    const { id } = await params;
    const existing = await prisma.priceBookItem.findFirst({
      where: { id, category: { companyId: user.companyId } },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.priceBookItem.update({ where: { id }, data: { active: false } });
    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
