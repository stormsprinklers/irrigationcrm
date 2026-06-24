import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePortalCustomer,
  portalForbiddenResponse,
  portalNotFoundResponse,
  portalUnauthorizedResponse,
} from "@/lib/portal/auth";
import { portalFeatureEnabled } from "@/lib/portal/permissions";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const ctx = await requirePortalCustomer();
  if (!ctx) return portalUnauthorizedResponse();
  if (!portalFeatureEnabled(ctx.company, "estimates")) {
    return portalForbiddenResponse("Estimates are not available in the portal");
  }

  const { id } = await params;
  const estimate = await prisma.estimate.findFirst({
    where: {
      companyId: ctx.companyId,
      customerId: ctx.customerId,
      OR: [{ id }, { publicToken: id }],
      status: { not: "DRAFT" },
    },
    select: {
      designExportMetadata: true,
      designProjectId: true,
    },
  });
  if (!estimate?.designProjectId) return portalNotFoundResponse();

  const metadata = estimate.designExportMetadata as Record<string, unknown> | null;
  const snapshot = metadata?.designSnapshot ?? null;

  return NextResponse.json({
    design: {
      snapshot,
      projectName: metadata?.projectName ?? null,
    },
  });
}
