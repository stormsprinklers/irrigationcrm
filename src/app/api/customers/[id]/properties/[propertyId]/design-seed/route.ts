import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { buildWizardSeedFromDesignSnapshot } from "@/lib/design/seed-from-design";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string; propertyId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id: customerId, propertyId } = await params;

    const property = await prisma.customerProperty.findFirst({
      where: { id: propertyId, customerId, companyId: user.companyId },
      select: { designProjectId: true },
    });
    if (!property?.designProjectId) {
      return NextResponse.json({ seed: null, reason: "No design project linked" });
    }

    const estimate = await prisma.estimate.findFirst({
      where: {
        companyId: user.companyId,
        propertyId,
        designProjectId: property.designProjectId,
      },
      orderBy: { updatedAt: "desc" },
      select: { designExportMetadata: true },
    });

    const metadata = estimate?.designExportMetadata as Record<string, unknown> | null;
    const snapshot = metadata?.designSnapshot as Record<string, unknown> | undefined;
    if (!snapshot) {
      return NextResponse.json({ seed: null, reason: "No design snapshot on estimate" });
    }

    const seed = buildWizardSeedFromDesignSnapshot(snapshot as never);
    return NextResponse.json({ seed, designProjectId: property.designProjectId });
  } catch {
    return unauthorizedResponse();
  }
}
