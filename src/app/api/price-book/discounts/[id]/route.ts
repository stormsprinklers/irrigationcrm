import { NextRequest, NextResponse } from "next/server";
import { DiscountType, PriceBookDiscountAppliesTo } from "@prisma/client";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { serializeDiscount } from "@/lib/price-book/extras";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    if (user.role === "TECH") return forbiddenResponse();
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.priceBookDiscount.findFirst({ where: { id, companyId: user.companyId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const discount = await prisma.priceBookDiscount.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: String(body.name) } : {}),
        ...(body.code !== undefined ? { code: body.code } : {}),
        ...(body.type !== undefined ? { type: body.type as DiscountType } : {}),
        ...(body.amount !== undefined ? { amount: body.amount } : {}),
        ...(body.active !== undefined ? { active: Boolean(body.active) } : {}),
        ...(body.appliesTo !== undefined ? { appliesTo: body.appliesTo as PriceBookDiscountAppliesTo } : {}),
      },
    });
    return NextResponse.json(serializeDiscount(discount));
  } catch {
    return unauthorizedResponse();
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    if (user.role === "TECH") return forbiddenResponse();
    const { id } = await params;
    const existing = await prisma.priceBookDiscount.findFirst({ where: { id, companyId: user.companyId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.priceBookDiscount.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
