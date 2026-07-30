import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { assertHolidayLightingEnabled } from "@/lib/holiday-lighting/catalog";
import {
  EMPTY_HOLIDAY_MEASUREMENTS,
  holidaySelectionsFromCatalog,
  parseHolidayMeasurements,
  parseHolidaySelections,
} from "@/lib/holiday-lighting/types";
import { loadHolidayCatalog } from "@/lib/holiday-lighting/catalog";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { holidayLightingFeaturesEnabled: true },
    });
    assertHolidayLightingEnabled(company ?? {});

    const customerId = request.nextUrl.searchParams.get("customerId");
    const quotes = await prisma.holidayLightingQuote.findMany({
      where: {
        companyId: user.companyId,
        ...(customerId ? { customerId } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: {
        customer: { select: { id: true, name: true } },
        estimate: { select: { id: true, estimateNumber: true, status: true } },
      },
    });
    return NextResponse.json({ quotes });
  } catch (error) {
    if (error instanceof Error && error.message.includes("disabled")) {
      return forbiddenResponse(error.message);
    }
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { holidayLightingFeaturesEnabled: true },
    });
    assertHolidayLightingEnabled(company ?? {});

    const body = await request.json().catch(() => ({}));
    const catalog = await loadHolidayCatalog(user.companyId);
    const quote = await prisma.holidayLightingQuote.create({
      data: {
        companyId: user.companyId,
        createdById: user.id,
        customerId: typeof body.customerId === "string" ? body.customerId : null,
        propertyId: typeof body.propertyId === "string" ? body.propertyId : null,
        address: typeof body.address === "string" ? body.address : null,
        city: typeof body.city === "string" ? body.city : null,
        state: typeof body.state === "string" ? body.state : null,
        zip: typeof body.zip === "string" ? body.zip : null,
        lat: typeof body.lat === "number" ? body.lat : null,
        lng: typeof body.lng === "number" ? body.lng : null,
        measurements: body.measurements
          ? parseHolidayMeasurements(body.measurements)
          : EMPTY_HOLIDAY_MEASUREMENTS,
        selections: body.selections
          ? parseHolidaySelections(body.selections)
          : holidaySelectionsFromCatalog(catalog),
      },
    });
    return NextResponse.json({ quote });
  } catch (error) {
    if (error instanceof Error && error.message.includes("disabled")) {
      return forbiddenResponse(error.message);
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error(error);
    return badRequestResponse(error instanceof Error ? error.message : "Failed to create quote");
  }
}
