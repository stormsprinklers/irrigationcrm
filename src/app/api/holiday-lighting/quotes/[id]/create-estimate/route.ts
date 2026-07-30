import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { assertHolidayLightingEnabled } from "@/lib/holiday-lighting/catalog";
import { createEstimateFromHolidayQuote } from "@/lib/holiday-lighting/create-estimate";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { holidayLightingFeaturesEnabled: true },
    });
    assertHolidayLightingEnabled(company ?? {});

    const { id } = await params;
    const estimate = await createEstimateFromHolidayQuote({
      companyId: user.companyId,
      quoteId: id,
      userId: user.id,
    });
    return NextResponse.json({ estimate });
  } catch (error) {
    if (error instanceof Error && error.message.includes("disabled")) {
      return forbiddenResponse(error.message);
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error(error);
    return badRequestResponse(error instanceof Error ? error.message : "Failed to create estimate");
  }
}
