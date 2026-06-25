import { NextRequest, NextResponse } from "next/server";
import { EstimateStatus } from "@prisma/client";
import { forbiddenForFieldRole, badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { computeEstimateExpiry, getEstimateForCompany, listEstimates } from "@/lib/estimates/queries";
import { getTemplateLineItemsForEstimate } from "@/lib/price-book/extras";
import { computeLineItemTotal, computeTotals } from "@/lib/visits/totals";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status") as EstimateStatus | null;

    const estimates = await listEstimates(user.companyId, {
      customerId: searchParams.get("customerId") ?? undefined,
      visitId: searchParams.get("visitId") ?? undefined,
      status: status ?? undefined,
      search: searchParams.get("search") ?? undefined,
    });

    return NextResponse.json({ estimates, total: estimates.length });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const fieldDenied = forbiddenForFieldRole(user.role); if (fieldDenied) return fieldDenied;

    const body = await request.json();
    if (!body.customerId) return badRequestResponse("customerId is required");

    const customer = await prisma.customer.findFirst({
      where: { id: body.customerId, companyId: user.companyId },
    });
    if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

    const company = await prisma.company.findUnique({ where: { id: user.companyId } });
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const expiresAt = computeEstimateExpiry(company.estimateExpiryDays);

    const estimate = await prisma.estimate.create({
      data: {
        companyId: user.companyId,
        customerId: body.customerId,
        propertyId: body.propertyId ?? null,
        visitId: body.visitId ?? null,
        status: EstimateStatus.DRAFT,
        expiresAt,
        depositRequired: company.estimateDepositRequired,
        depositType: company.estimateDepositType,
        depositAmount: company.estimateDepositAmount,
      },
    });

    if (body.templateId) {
      const templateItems = await getTemplateLineItemsForEstimate(user.companyId, body.templateId);
      if (templateItems.length > 0) {
        const lineItems = templateItems.map((item, index) => {
          const qty = Number(item.quantity);
          const price = Number(item.unitPrice);
          const total = computeLineItemTotal(qty, price);
          return {
            estimateId: estimate.id,
            priceBookItemId: item.priceBookItemId,
            name: item.name,
            description: item.description,
            quantity: qty,
            unitPrice: price,
            total,
            sortOrder: index,
          };
        });
        await prisma.estimateLineItem.createMany({ data: lineItems });
        const subtotal = lineItems.reduce((s, i) => s + i.total, 0);
        const totals = computeTotals(subtotal, 0);
        await prisma.estimate.update({
          where: { id: estimate.id },
          data: totals,
        });
      }
    }

    const full = await getEstimateForCompany(user.companyId, estimate.id);
    return NextResponse.json(full, { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
