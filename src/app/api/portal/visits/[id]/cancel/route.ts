import { NextResponse } from "next/server";
import { VisitStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  requirePortalCustomer,
  portalForbiddenResponse,
  portalNotFoundResponse,
  portalUnauthorizedResponse,
} from "@/lib/portal/auth";
import { portalFeatureEnabled } from "@/lib/portal/permissions";
import {
  assertVisitReschedulable,
  assertVisitWithinLeadHours,
  getCustomerVisit,
} from "@/lib/portal/scheduling";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const ctx = await requirePortalCustomer();
  if (!ctx) return portalUnauthorizedResponse();
  if (!portalFeatureEnabled(ctx.company, "jobs")) {
    return portalForbiddenResponse("Jobs are not available in the portal");
  }

  const { id } = await params;
  const visit = await getCustomerVisit(ctx.companyId, ctx.customerId, id);
  if (!visit) return portalNotFoundResponse();

  try {
    assertVisitReschedulable(visit.status);
    if (visit.startAt) {
      assertVisitWithinLeadHours(visit.startAt, ctx.company.portalCancelLeadHours, "cancel");
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cannot cancel" },
      { status: 400 }
    );
  }

  await prisma.visit.update({
    where: { id },
    data: { status: VisitStatus.CANCELLED },
  });

  return NextResponse.json({ ok: true });
}
