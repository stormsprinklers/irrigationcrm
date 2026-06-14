import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { listPricingForms, serializePricingForm } from "@/lib/price-book/extras";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const forms = await listPricingForms(user.companyId);
    return NextResponse.json({ forms });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role === "TECH") return forbiddenResponse();
    const body = await request.json();
    if (!body.name) return badRequestResponse("name is required");

    const form = await prisma.pricingForm.create({
      data: {
        companyId: user.companyId,
        name: String(body.name),
        description: body.description ?? null,
        fields: body.fields ?? [],
        categoryId: body.categoryId ?? null,
      },
      include: { category: { select: { id: true, name: true } } },
    });

    return NextResponse.json(serializePricingForm(form), { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
