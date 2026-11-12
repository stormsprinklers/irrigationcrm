import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { requireFieldVisitAccess } from "@/lib/field/visit-guard";
import { canEditVisitHolidayLightingSpecs } from "@/lib/holiday-lighting/spec-permissions";
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
    if (!canEditVisitHolidayLightingSpecs(user.role)) return forbiddenResponse();
    const { id } = await params;
    const access = await requireFieldVisitAccess(user, id);
    if (!access.ok) return access.response;

    const visit = await prisma.visit.findFirst({
      where: { id, companyId: user.companyId },
      select: { designExportMetadata: true },
    });
    if (!visit) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const patch = parseHolidayLightingSpecPatch(await request.json().catch(() => ({})));
    const designExportMetadata = updateHolidayLightingSpecs(
      visit.designExportMetadata,
      patch,
      { markVisitOverride: true }
    ) as Prisma.InputJsonObject;
    await prisma.visit.update({
      where: { id },
      data: { designExportMetadata },
    });
    return NextResponse.json({ designExportMetadata });
  } catch (error) {
    if (error instanceof HolidayLightingSpecError) {
      return badRequestResponse(error.message);
    }
    if (!(error instanceof Error) || error.message !== "Unauthorized") {
      console.error("[visits/holiday-lighting-specs] update failed", error);
      return NextResponse.json({ error: "Failed to update lighting specs" }, { status: 500 });
    }
    return unauthorizedResponse();
  }
}
