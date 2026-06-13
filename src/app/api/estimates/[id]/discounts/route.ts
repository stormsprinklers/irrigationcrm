import { NextRequest, NextResponse } from "next/server";
import { DiscountType } from "@prisma/client";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getEstimateForCompany, recalculateEstimateTotals } from "@/lib/estimates/queries";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const discounts = await prisma.discount.findMany({
      where: { estimateId: id, estimate: { companyId: user.companyId } },
    });
    return NextResponse.json(discounts);
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const estimate = await prisma.estimate.findFirst({ where: { id, companyId: user.companyId } });
    if (!estimate) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    if (!body.type || body.amount === undefined) return badRequestResponse("type and amount required");

    await prisma.discount.create({
      data: {
        estimateId: id,
        label: body.label ?? null,
        type: body.type as DiscountType,
        amount: Number(body.amount),
      },
    });

    await recalculateEstimateTotals(id);
    const updated = await getEstimateForCompany(user.companyId, id);
    return NextResponse.json(updated, { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const discountId = request.nextUrl.searchParams.get("discountId");
    if (!discountId) return badRequestResponse("discountId required");

    await prisma.discount.deleteMany({
      where: { id: discountId, estimateId: id, estimate: { companyId: user.companyId } },
    });

    await recalculateEstimateTotals(id);
    const updated = await getEstimateForCompany(user.companyId, id);
    return NextResponse.json(updated);
  } catch {
    return unauthorizedResponse();
  }
}
