import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { requireFieldVisitAccess } from "@/lib/field/visit-guard";
import { HOLIDAY_STRAND_COLORS } from "@/lib/holiday-lighting/types";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const access = await requireFieldVisitAccess(user, id);
    if (!access.ok) return access.response;

    const visit = await prisma.visit.findFirst({
      where: { id, companyId: user.companyId },
      select: { designExportMetadata: true },
    });
    if (!visit) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const metadata = record(visit.designExportMetadata);
    if (!metadata || metadata.source !== "holiday-lighting-quote") {
      return badRequestResponse("This visit is not linked to a holiday lighting estimate");
    }

    const body = await request.json();
    const next = { ...metadata } as Record<string, unknown>;
    next.visitSpecsUpdated = true;
    if (body.strandColor !== undefined) {
      if (!HOLIDAY_STRAND_COLORS.includes(body.strandColor)) {
        return badRequestResponse("Strand color must be Black, White, or Green");
      }
      next.strandColor = body.strandColor;
    }
    if (body.colorPattern !== undefined) {
      const colorPattern = String(body.colorPattern).trim();
      if (!colorPattern || colorPattern.length > 120 || /^other$/i.test(colorPattern)) {
        return badRequestResponse("Enter a specific light color or pattern");
      }
      next.colorPattern = colorPattern;
      const strandMap = record(next.strandMap);
      if (strandMap && Array.isArray(strandMap.features)) {
        next.strandMap = {
          ...strandMap,
          features: strandMap.features.map((feature) => {
            const item = record(feature);
            return item ? { ...item, bulbColors: colorPattern } : feature;
          }),
        };
      }
    }

    const designExportMetadata = next as Prisma.InputJsonObject;
    await prisma.visit.update({
      where: { id },
      data: { designExportMetadata },
    });
    return NextResponse.json({ designExportMetadata });
  } catch {
    return unauthorizedResponse();
  }
}
