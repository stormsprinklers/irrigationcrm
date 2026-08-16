import { NextRequest, NextResponse } from "next/server";
import { EstimateStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  requirePortalCustomer,
  portalForbiddenResponse,
  portalNotFoundResponse,
} from "@/lib/portal/auth";
import { portalFeatureEnabled } from "@/lib/portal/permissions";
import { serializePortalEstimate } from "@/lib/portal/serializers";
import { findEstimateByPublicToken } from "@/lib/portal/public-estimate";
import { onEstimateClosed } from "@/lib/notifications/estimate-followup";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const ctx = await requirePortalCustomer();
  const body = await request.json().catch(() => ({}));
  const optionId = typeof body.optionId === "string" ? body.optionId : null;
  if (!optionId) {
    return NextResponse.json({ error: "optionId is required" }, { status: 400 });
  }

  let estimateId: string | null = null;
  let companyId: string | null = null;

  if (ctx) {
    if (!portalFeatureEnabled(ctx.company, "estimates")) {
      return portalForbiddenResponse("Estimates are not available in the portal");
    }
    const estimate = await prisma.estimate.findFirst({
      where: {
        companyId: ctx.companyId,
        customerId: ctx.customerId,
        OR: [{ id }, { publicToken: id }],
        status: { in: ["SENT"] },
      },
    });
    if (estimate) {
      estimateId = estimate.id;
      companyId = estimate.companyId;
    }
  } else {
    const estimate = await findEstimateByPublicToken(id);
    if (estimate?.status === "SENT") {
      estimateId = estimate.id;
      companyId = estimate.companyId;
    }
  }

  if (!estimateId || !companyId) return portalNotFoundResponse();

  const option = await prisma.estimateOption.findFirst({
    where: { id: optionId, estimateId },
  });
  if (!option) return NextResponse.json({ error: "Option not found" }, { status: 404 });

  await prisma.estimateOption.update({
    where: { id: optionId },
    data: { declinedAt: new Date() },
  });

  const remaining = await prisma.estimateOption.findMany({ where: { estimateId } });
  const allDeclined = remaining.every((row) => row.declinedAt || row.id === optionId);
  if (allDeclined) {
    await prisma.estimate.update({
      where: { id: estimateId },
      data: { status: EstimateStatus.DECLINED },
    });
    void onEstimateClosed(estimateId).catch(() => {});
  }

  const updated = await prisma.estimate.findFirst({
    where: { id: estimateId },
    include: {
      lineItems: {
        orderBy: { sortOrder: "asc" },
        include: { priceBookItem: { select: { type: true } } },
      },
      options: { orderBy: { sortOrder: "asc" } },
      discounts: true,
      visit: {
        select: {
          id: true,
          title: true,
          startAt: true,
          endAt: true,
          assignedUser: { select: { name: true, photoUrl: true, title: true } },
        },
      },
      company: { select: { estimateWarrantyText: true } },
    },
  });

  return NextResponse.json({ estimate: updated ? serializePortalEstimate(updated) : null });
}
