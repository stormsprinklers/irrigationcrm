import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePortalCustomer,
  portalForbiddenResponse,
  portalNotFoundResponse,
} from "@/lib/portal/auth";
import { portalFeatureEnabled } from "@/lib/portal/permissions";
import { findEstimateByPublicToken } from "@/lib/portal/public-estimate";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const ctx = await requirePortalCustomer();

  let designProjectId: string | null = null;
  let designExportMetadata: unknown = null;

  if (ctx) {
    if (!portalFeatureEnabled(ctx.company, "estimates")) {
      return portalForbiddenResponse("Estimates are not available in the portal");
    }
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
    designProjectId = estimate.designProjectId;
    designExportMetadata = estimate.designExportMetadata;
  } else {
    const estimate = await findEstimateByPublicToken(id);
    if (!estimate?.designProjectId) return portalNotFoundResponse();
    designProjectId = estimate.designProjectId;
    designExportMetadata = estimate.designExportMetadata;
  }

  if (!designProjectId) return portalNotFoundResponse();

  const metadata = designExportMetadata as Record<string, unknown> | null;
  const snapshot = metadata?.designSnapshot ?? null;

  return NextResponse.json({
    design: {
      snapshot,
      projectName: metadata?.projectName ?? null,
    },
  });
}
