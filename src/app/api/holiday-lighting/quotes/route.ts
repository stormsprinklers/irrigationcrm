import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { assertHolidayLightingEnabled, loadHolidayCatalog } from "@/lib/holiday-lighting/catalog";
import { ensureHolidayPriceBookItems } from "@/lib/holiday-lighting/price-book";
import {
  EMPTY_HOLIDAY_MEASUREMENTS,
  applyHolidayCatalogPolicy,
  holidaySelectionsFromCatalog,
  parseHolidayMeasurements,
  parseHolidaySelections,
} from "@/lib/holiday-lighting/types";
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
    const requestedCustomerId =
      typeof body.customerId === "string" && body.customerId.trim()
        ? body.customerId.trim()
        : null;
    const requestedPropertyId =
      typeof body.propertyId === "string" && body.propertyId.trim()
        ? body.propertyId.trim()
        : null;
    const requestedVisitId =
      typeof body.visitId === "string" && body.visitId.trim() ? body.visitId.trim() : null;

    const visit = requestedVisitId
      ? await prisma.visit.findFirst({
          where: { id: requestedVisitId, companyId: user.companyId },
          select: {
            customerId: true,
            propertyId: true,
            address: true,
            city: true,
            state: true,
            zip: true,
          },
        })
      : null;
    if (requestedVisitId && !visit) {
      return badRequestResponse("Visit not found");
    }
    if (requestedCustomerId && visit?.customerId && requestedCustomerId !== visit.customerId) {
      return badRequestResponse("The visit belongs to a different customer");
    }
    if (requestedPropertyId && visit?.propertyId && requestedPropertyId !== visit.propertyId) {
      return badRequestResponse("The visit belongs to a different property");
    }

    const customerId = requestedCustomerId ?? visit?.customerId ?? null;
    const propertyId = requestedPropertyId ?? visit?.propertyId ?? null;
    const [customer, property] = await Promise.all([
      customerId
        ? prisma.customer.findFirst({
            where: { id: customerId, companyId: user.companyId },
            select: { id: true },
          })
        : null,
      propertyId
        ? prisma.customerProperty.findFirst({
            where: { id: propertyId, companyId: user.companyId },
            select: { id: true, customerId: true },
          })
        : null,
    ]);
    if (customerId && !customer) {
      return badRequestResponse("Customer not found");
    }
    if (propertyId && !property) {
      return badRequestResponse("Property not found");
    }
    if (customerId && property && property.customerId !== customerId) {
      return badRequestResponse("The property belongs to a different customer");
    }

    const catalog = await loadHolidayCatalog(user.companyId);
    await ensureHolidayPriceBookItems(user.companyId, catalog);
    const quote = await prisma.holidayLightingQuote.create({
      data: {
        companyId: user.companyId,
        createdById: user.id,
        customerId,
        propertyId,
        visitId: requestedVisitId,
        address: typeof body.address === "string" ? body.address : visit?.address ?? null,
        city: typeof body.city === "string" ? body.city : visit?.city ?? null,
        state: typeof body.state === "string" ? body.state : visit?.state ?? null,
        zip: typeof body.zip === "string" ? body.zip : visit?.zip ?? null,
        lat: typeof body.lat === "number" ? body.lat : null,
        lng: typeof body.lng === "number" ? body.lng : null,
        measurements: body.measurements
          ? parseHolidayMeasurements(body.measurements)
          : EMPTY_HOLIDAY_MEASUREMENTS,
        selections: body.selections
          ? applyHolidayCatalogPolicy(parseHolidaySelections(body.selections), catalog)
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
