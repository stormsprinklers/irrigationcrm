import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { canEditEstimateHolidayLightingSpecs } from "@/lib/holiday-lighting/spec-permissions";
import {
  HolidayLightingSpecError,
  parseHolidayLightingSpecPatch,
  updateHolidayLightingSpecs,
} from "@/lib/holiday-lighting/specs";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canEditEstimateHolidayLightingSpecs(user.role)) return forbiddenResponse();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const optionId = typeof body.optionId === "string" ? body.optionId : "";
    if (!optionId) return badRequestResponse("optionId is required");

    const estimate = await prisma.estimate.findFirst({
      where: { id, companyId: user.companyId },
      select: {
        designExportMetadata: true,
        options: {
          where: { id: optionId },
          select: { letter: true },
          take: 1,
        },
      },
    });
    if (!estimate) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const optionLetter = estimate.options[0]?.letter;
    if (!optionLetter) {
      return badRequestResponse("The selected estimate option is not a holiday lighting option");
    }

    const patch = parseHolidayLightingSpecPatch(body);
    const designExportMetadata = updateHolidayLightingSpecs(
      estimate.designExportMetadata,
      patch,
      { optionLetter }
    ) as Prisma.InputJsonObject;
    await prisma.estimate.update({
      where: { id },
      data: { designExportMetadata },
    });

    return NextResponse.json({ designExportMetadata });
  } catch (error) {
    if (error instanceof HolidayLightingSpecError) {
      return badRequestResponse(error.message);
    }
    if (!(error instanceof Error) || error.message !== "Unauthorized") {
      console.error("[estimates/holiday-lighting-specs] update failed", error);
      return NextResponse.json({ error: "Failed to update lighting specs" }, { status: 500 });
    }
    return unauthorizedResponse();
  }
}
