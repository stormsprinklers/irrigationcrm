import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { serializeTemplate } from "@/lib/price-book/extras";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    if (user.role === "TECH") return forbiddenResponse();
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.estimateTemplate.findFirst({ where: { id, companyId: user.companyId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (body.lineItems) {
      await prisma.estimateTemplateLineItem.deleteMany({ where: { templateId: id } });
      await prisma.estimateTemplateLineItem.createMany({
        data: body.lineItems.map(
          (
            item: {
              name: string;
              description?: string;
              quantity?: number;
              unitPrice: number;
              priceBookItemId?: string;
            },
            index: number
          ) => ({
            templateId: id,
            name: item.name,
            description: item.description ?? null,
            quantity: item.quantity ?? 1,
            unitPrice: item.unitPrice,
            priceBookItemId: item.priceBookItemId ?? null,
            sortOrder: index,
          })
        ),
      });
    }

    const template = await prisma.estimateTemplate.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: String(body.name) } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
      },
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    });

    return NextResponse.json(serializeTemplate(template));
  } catch {
    return unauthorizedResponse();
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    if (user.role === "TECH") return forbiddenResponse();
    const { id } = await params;
    const existing = await prisma.estimateTemplate.findFirst({ where: { id, companyId: user.companyId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.estimateTemplate.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
