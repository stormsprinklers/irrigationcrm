import { NextRequest, NextResponse } from "next/server";
import { forbiddenForFieldRole, badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { listTemplates, serializeTemplate } from "@/lib/price-book/extras";
import { computeTotals, sumLineItems } from "@/lib/visits/totals";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const templates = await listTemplates(user.companyId);
    return NextResponse.json({ templates });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const fieldDenied = forbiddenForFieldRole(user.role); if (fieldDenied) return fieldDenied;
    const body = await request.json();
    if (!body.name) return badRequestResponse("name is required");

    const template = await prisma.estimateTemplate.create({
      data: {
        companyId: user.companyId,
        name: String(body.name),
        description: body.description ?? null,
        lineItems: {
          create: (body.lineItems ?? []).map(
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
              name: item.name,
              description: item.description ?? null,
              quantity: item.quantity ?? 1,
              unitPrice: item.unitPrice,
              priceBookItemId: item.priceBookItemId ?? null,
              sortOrder: index,
            })
          ),
        },
      },
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    });

    return NextResponse.json(serializeTemplate(template), { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
