import { NextRequest, NextResponse } from "next/server";
import { EstimateStatus, IntegrationType } from "@prisma/client";
import { authenticateIntegration, isIntegrationContext } from "@/lib/integrations/auth";
import { logIntegrationAudit } from "@/lib/integrations/audit";
import { designEstimateSchema } from "@/lib/integrations/schemas";
import { computeEstimateExpiry } from "@/lib/estimates/queries";
import { computeLineItemTotal, computeTotals } from "@/lib/visits/totals";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const auth = await authenticateIntegration(request, IntegrationType.DESIGN);
  if (!isIntegrationContext(auth)) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = designEstimateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const input = parsed.data;

  const existing = await prisma.estimate.findFirst({
    where: {
      companyId: auth.companyId,
      designProjectId: input.designProjectId ?? undefined,
      designVersionId: input.designVersionId ?? undefined,
    },
  });

  if (existing && input.externalId) {
    const crmUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    return NextResponse.json({
      estimateId: existing.id,
      created: false,
      staffUrl: `${crmUrl}/customers/estimates/${existing.id}`,
    });
  }

  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, companyId: auth.companyId },
  });
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  try {
    const company = await prisma.company.findUnique({ where: { id: auth.companyId } });
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const expiresAt = computeEstimateExpiry(company.estimateExpiryDays);
    const status = input.status === "SENT" ? EstimateStatus.SENT : EstimateStatus.DRAFT;

    const lineItemsData = input.lineItems.map((item, index) => {
      const total = computeLineItemTotal(item.quantity, item.unitPrice);
      return {
        name: item.name,
        description: item.description ?? null,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total,
        sortOrder: index,
      };
    });

    const subtotal = lineItemsData.reduce((s, i) => s + i.total, 0);
    const totals = computeTotals(subtotal, 0);

    const estimate = await prisma.estimate.create({
      data: {
        companyId: auth.companyId,
        customerId: input.customerId,
        propertyId: input.propertyId ?? null,
        status,
        expiresAt,
        depositRequired: company.estimateDepositRequired,
        depositType: company.estimateDepositType,
        depositAmount: company.estimateDepositAmount,
        designProjectId: input.designProjectId ?? null,
        designVersionId: input.designVersionId ?? null,
        designExportMetadata: {
          ...(input.designExportMetadata ?? {}),
          ...(input.notes ? { exportNotes: input.notes } : {}),
        },
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        total: totals.total,
        lineItems: { create: lineItemsData },
      },
    });

    await logIntegrationAudit({
      companyId: auth.companyId,
      integrationType: IntegrationType.DESIGN,
      action: "design.estimates.create",
      payload: { externalId: input.externalId, estimateId: estimate.id },
      status: "success",
    });

    const crmUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    return NextResponse.json(
      {
        estimateId: estimate.id,
        created: true,
        staffUrl: `${crmUrl}/customers/estimates/${estimate.id}`,
      },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create estimate";
    await logIntegrationAudit({
      companyId: auth.companyId,
      integrationType: IntegrationType.DESIGN,
      action: "design.estimates.create",
      payload: body,
      status: "error",
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
