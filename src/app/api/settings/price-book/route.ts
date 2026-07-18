import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
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

    return NextResponse.json(company);
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

    return NextResponse.json(company);
  } catch {
    return unauthorizedResponse();
  }
}
