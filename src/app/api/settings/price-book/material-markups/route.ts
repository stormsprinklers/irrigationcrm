import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { listMarkupTiers } from "@/lib/price-book/queries";
import { recalculateCalculatedServicesForCompany, recalculateMarkedUpMaterialsForCompany } from "@/lib/price-book/pricing";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const tiers = await listMarkupTiers(user.companyId);
    return NextResponse.json(tiers);
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { tiers } = body as {
      tiers?: Array<{ minCost: number; maxCost?: number | null; markupPercent: number }>;
    };

    if (!Array.isArray(tiers)) {
      return NextResponse.json({ error: "tiers array required" }, { status: 400 });
    }

    await prisma.materialMarkupTier.deleteMany({ where: { companyId: user.companyId } });
    await prisma.materialMarkupTier.createMany({
      data: tiers.map((tier, index) => ({
        companyId: user.companyId,
        minCost: tier.minCost,
        maxCost: tier.maxCost ?? null,
        markupPercent: tier.markupPercent,
        sortOrder: index,
      })),
    });

    await recalculateCalculatedServicesForCompany(user.companyId);
    await recalculateMarkedUpMaterialsForCompany(user.companyId);

    const updated = await listMarkupTiers(user.companyId);
    return NextResponse.json(updated);
  } catch {
    return unauthorizedResponse();
  }
}
