import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { listLaborRates, listMarkupTiers } from "@/lib/price-book/queries";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: {
        flatRatePricingEnabled: true,
        materialMarkupsEnabled: true,
      },
    });

    const [laborRates, tiers] = await Promise.all([
      listLaborRates(user.companyId),
      listMarkupTiers(user.companyId),
    ]);

    return NextResponse.json({
      ...company,
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
      laborRateCount: laborRates.length,
      markupTierCount: tiers.length,
    });
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
    const { flatRatePricingEnabled, materialMarkupsEnabled } = body;

    const company = await prisma.company.update({
      where: { id: user.companyId },
      data: {
        ...(flatRatePricingEnabled !== undefined
          ? { flatRatePricingEnabled: Boolean(flatRatePricingEnabled) }
          : {}),
        ...(materialMarkupsEnabled !== undefined
          ? { materialMarkupsEnabled: Boolean(materialMarkupsEnabled) }
          : {}),
      },
      select: {
        flatRatePricingEnabled: true,
        materialMarkupsEnabled: true,
      },
    });

    return NextResponse.json({
      ...company,
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    });
  } catch {
    return unauthorizedResponse();
  }
}
