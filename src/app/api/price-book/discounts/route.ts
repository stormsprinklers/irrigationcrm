import { NextRequest, NextResponse } from "next/server";
import { DiscountType, PriceBookDiscountAppliesTo } from "@prisma/client";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { listDiscounts, serializeDiscount } from "@/lib/price-book/extras";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const discounts = await listDiscounts(user.companyId);
    return NextResponse.json({ discounts });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role === "TECH") return forbiddenResponse();
    const body = await request.json();
    if (!body.name || body.amount == null) return badRequestResponse("name and amount are required");

    const discount = await prisma.priceBookDiscount.create({
      data: {
        companyId: user.companyId,
        name: String(body.name),
        code: body.code ?? null,
        type: (body.type as DiscountType) ?? DiscountType.PERCENT,
        amount: body.amount,
        active: body.active ?? true,
        appliesTo: (body.appliesTo as PriceBookDiscountAppliesTo) ?? PriceBookDiscountAppliesTo.ALL,
      },
    });
    return NextResponse.json(serializeDiscount(discount), { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
