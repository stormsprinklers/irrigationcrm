import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getEstimateForCompany, recalculateEstimateTotals } from "@/lib/estimates/queries";
import { buildLineItemFromPriceBook } from "@/lib/price-book/pricing";
import { prisma } from "@/lib/prisma";
import { computeLineItemTotal } from "@/lib/visits/totals";

type Params = { params: Promise<{ id: string }> };

async function assertEstimate(companyId: string, estimateId: string) {
  return prisma.estimate.findFirst({ where: { id: estimateId, companyId } });
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const items = await prisma.estimateLineItem.findMany({
      where: { estimateId: id, estimate: { companyId: user.companyId } },
      orderBy: { sortOrder: "asc" },
    });
    return NextResponse.json(items);
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    if (!(await assertEstimate(user.companyId, id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();

    let name = body.name ? String(body.name) : "";
    let description = body.description ?? null;
    let unitPrice = Number(body.unitPrice ?? 0);
    let priceBookItemId = body.priceBookItemId ?? null;
    const quantity = Number(body.quantity ?? 1);

    if (body.priceBookItemId) {
      const fromBook = await buildLineItemFromPriceBook(user.companyId, String(body.priceBookItemId));
      name = fromBook.name;
      description = fromBook.description ?? description;
      unitPrice = fromBook.unitPrice;
      priceBookItemId = fromBook.priceBookItemId;
    }

    if (!name) return badRequestResponse("name is required");

    await prisma.estimateLineItem.create({
      data: {
        estimateId: id,
        priceBookItemId,
        name,
        description,
        quantity,
        unitPrice,
        total: computeLineItemTotal(quantity, unitPrice),
        sortOrder: body.sortOrder ?? 0,
      },
    });

    await recalculateEstimateTotals(id);
    const estimate = await getEstimateForCompany(user.companyId, id);
    return NextResponse.json(estimate, { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const body = await request.json();
    if (!body.lineItemId) return badRequestResponse("lineItemId required");

    const existing = await prisma.estimateLineItem.findFirst({
      where: { id: body.lineItemId, estimateId: id, estimate: { companyId: user.companyId } },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const quantity = body.quantity !== undefined ? Number(body.quantity) : Number(existing.quantity);
    const unitPrice = body.unitPrice !== undefined ? Number(body.unitPrice) : Number(existing.unitPrice);

    await prisma.estimateLineItem.update({
      where: { id: body.lineItemId },
      data: {
        ...(body.name !== undefined ? { name: String(body.name) } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        quantity,
        unitPrice,
        total: computeLineItemTotal(quantity, unitPrice),
      },
    });

    await recalculateEstimateTotals(id);
    const estimate = await getEstimateForCompany(user.companyId, id);
    return NextResponse.json(estimate);
  } catch {
    return unauthorizedResponse();
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const lineItemId = request.nextUrl.searchParams.get("lineItemId");
    if (!lineItemId) return badRequestResponse("lineItemId required");

    await prisma.estimateLineItem.deleteMany({
      where: { id: lineItemId, estimateId: id, estimate: { companyId: user.companyId } },
    });

    await recalculateEstimateTotals(id);
    const estimate = await getEstimateForCompany(user.companyId, id);
    return NextResponse.json(estimate);
  } catch {
    return unauthorizedResponse();
  }
}
