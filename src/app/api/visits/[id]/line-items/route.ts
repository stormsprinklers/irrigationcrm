import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { buildLineItemFromPriceBook } from "@/lib/price-book/pricing";
import { prisma } from "@/lib/prisma";
import { computeLineItemTotal } from "@/lib/visits/totals";
import { getVisitForCompany } from "@/lib/visits/queries";

type Params = { params: Promise<{ id: string }> };

async function assertVisit(companyId: string, visitId: string) {
  return prisma.visit.findFirst({ where: { id: visitId, companyId } });
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const items = await prisma.visitLineItem.findMany({
      where: { visitId: id, visit: { companyId: user.companyId } },
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
    if (!(await assertVisit(user.companyId, id))) {
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

    const total = computeLineItemTotal(quantity, unitPrice);
    await prisma.visitLineItem.create({
      data: {
        visitId: id,
        priceBookItemId,
        name,
        description,
        quantity,
        unitPrice,
        total,
        sortOrder: body.sortOrder ?? 0,
      },
    });

    const visit = await getVisitForCompany(user.companyId, id);
    return NextResponse.json(visit, { status: 201 });
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

    const existing = await prisma.visitLineItem.findFirst({
      where: { id: body.lineItemId, visitId: id, visit: { companyId: user.companyId } },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const quantity = body.quantity !== undefined ? Number(body.quantity) : Number(existing.quantity);
    const unitPrice = body.unitPrice !== undefined ? Number(body.unitPrice) : Number(existing.unitPrice);

    await prisma.visitLineItem.update({
      where: { id: body.lineItemId },
      data: {
        ...(body.name !== undefined ? { name: String(body.name) } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        quantity,
        unitPrice,
        total: computeLineItemTotal(quantity, unitPrice),
      },
    });

    const visit = await getVisitForCompany(user.companyId, id);
    return NextResponse.json(visit);
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

    await prisma.visitLineItem.deleteMany({
      where: { id: lineItemId, visitId: id, visit: { companyId: user.companyId } },
    });

    const visit = await getVisitForCompany(user.companyId, id);
    return NextResponse.json(visit);
  } catch {
    return unauthorizedResponse();
  }
}
