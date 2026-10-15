import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import {
  assertHolidayLightingEnabled,
  loadHolidayCatalog,
  loadHolidayPriceLookup,
} from "@/lib/holiday-lighting/catalog";
import { createEstimateFromHolidayQuote } from "@/lib/holiday-lighting/create-estimate";
import { computeHolidayQuotePricing } from "@/lib/holiday-lighting/pricing";
import {
  applyHolidayCatalogPolicy,
  holidayDesignOptionsFromQuote,
  parseHolidayMeasurements,
  parseHolidaySelections,
} from "@/lib/holiday-lighting/types";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

async function loadOwnedQuote(companyId: string, id: string) {
  return prisma.holidayLightingQuote.findFirst({
    where: { id, companyId },
    include: {
      customer: { select: { id: true, name: true, email: true, phone: true } },
      estimate: { select: { id: true, estimateNumber: true, status: true, publicToken: true } },
    },
  });
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser(request);
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { name: true, irrigationFeaturesEnabled: true, holidayLightingFeaturesEnabled: true, holidayLightingCatalog: true },
    });
    assertHolidayLightingEnabled(company ?? {});

    const { id } = await params;
    const quote = await loadOwnedQuote(user.companyId, id);
    if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const catalog = await loadHolidayCatalog(user.companyId);
    const prices = await loadHolidayPriceLookup(user.companyId);
    const selections = applyHolidayCatalogPolicy(
      parseHolidaySelections(quote.selections),
      catalog
    );
    const measurements = parseHolidayMeasurements(quote.measurements);
    const options = holidayDesignOptionsFromQuote({ measurements, selections, catalog });
    const active = options.find((option) => option.id === selections.activeDesignOptionId) ?? options[0]!;
    const pricing = computeHolidayQuotePricing({
      catalog,
      measurements: active.measurements,
      selections: applyHolidayCatalogPolicy(active.selections, catalog),
      prices,
    });

    return NextResponse.json({ quote, catalog, pricing, optionPricing: Object.fromEntries(options.map((option) => [option.id, computeHolidayQuotePricing({ catalog, measurements: option.measurements, selections: applyHolidayCatalogPolicy(option.selections, catalog), prices })])) });
  } catch (error) {
    if (error instanceof Error && error.message.includes("disabled")) {
      return forbiddenResponse(error.message);
    }
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser(request);
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { name: true, irrigationFeaturesEnabled: true, holidayLightingFeaturesEnabled: true },
    });
    assertHolidayLightingEnabled(company ?? {});

    const { id } = await params;
    const existing = await loadOwnedQuote(user.companyId, id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const customerId = "customerId" in body ? body.customerId : existing.customerId;
    const propertyId = "propertyId" in body ? body.propertyId : existing.propertyId;
    if ((customerId != null && typeof customerId !== "string") || (propertyId != null && typeof propertyId !== "string")) {
      return badRequestResponse("Invalid customer or property");
    }
    const [customer, property] = await Promise.all([
      customerId ? prisma.customer.findFirst({ where: { id: customerId, companyId: user.companyId }, select: { id: true } }) : null,
      propertyId ? prisma.customerProperty.findFirst({ where: { id: propertyId, companyId: user.companyId }, select: { id: true, customerId: true } }) : null,
    ]);
    if (customerId && !customer) return badRequestResponse("Customer not found");
    if (propertyId && (!property || property.customerId !== customerId)) return badRequestResponse("Property does not belong to the selected customer");
    if (existing.visitId && (customerId !== existing.customerId || propertyId !== existing.propertyId)) {
      return badRequestResponse("A visit quote must keep its visit customer and property");
    }
    const expectedUpdatedAt = typeof body.expectedUpdatedAt === "string" ? new Date(body.expectedUpdatedAt) : undefined;
    if (expectedUpdatedAt && Number.isNaN(expectedUpdatedAt.getTime())) return badRequestResponse("Invalid quote version");
    const catalog = await loadHolidayCatalog(user.companyId);
    const data: Record<string, unknown> = {};
    for (const key of [
      "customerId",
      "propertyId",
      "address",
      "city",
      "state",
      "zip",
      "lat",
      "lng",
      "previewImageUrl",
      "sourcePhotoUrl",
    ] as const) {
      if (key in body) data[key] = body[key];
    }
    if ("measurements" in body) data.measurements = parseHolidayMeasurements(body.measurements);
    if ("selections" in body) {
      data.selections = applyHolidayCatalogPolicy(
        parseHolidaySelections(body.selections),
        catalog
      );
    }

    const quote = await prisma.holidayLightingQuote.update({
      where: { id, companyId: user.companyId, ...(expectedUpdatedAt ? { updatedAt: expectedUpdatedAt } : {}) },
      data,
      include: {
        customer: { select: { id: true, name: true, email: true, phone: true } },
        estimate: { select: { id: true, estimateNumber: true, status: true, publicToken: true } },
      },
    });

    const prices = await loadHolidayPriceLookup(user.companyId);
    const savedMeasurements = parseHolidayMeasurements(quote.measurements);
    const savedSelections = applyHolidayCatalogPolicy(parseHolidaySelections(quote.selections), catalog);
    const options = holidayDesignOptionsFromQuote({
      measurements: savedMeasurements,
      selections: savedSelections,
      catalog,
    });
    const active = options.find((option) => option.id === savedSelections.activeDesignOptionId) ?? options[0]!;
    const pricing = computeHolidayQuotePricing({
      catalog,
      measurements: active.measurements,
      selections: applyHolidayCatalogPolicy(active.selections, catalog),
      prices,
    });

    return NextResponse.json({ quote, pricing, optionPricing: Object.fromEntries(options.map((option) => [option.id, computeHolidayQuotePricing({ catalog, measurements: option.measurements, selections: applyHolidayCatalogPolicy(option.selections, catalog), prices })])) });
  } catch (error) {
    if (error instanceof Error && error.message.includes("disabled")) {
      return forbiddenResponse(error.message);
    }
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "This quote changed in the CRM. Reload before saving to avoid overwriting another edit." }, { status: 409 });
    }
    console.error(error);
    return badRequestResponse(error instanceof Error ? error.message : "Update failed");
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser(request);
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { name: true, irrigationFeaturesEnabled: true, holidayLightingFeaturesEnabled: true },
    });
    assertHolidayLightingEnabled(company ?? {});

    const { id } = await params;
    const existing = await loadOwnedQuote(user.companyId, id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.holidayLightingQuote.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes("disabled")) {
      return forbiddenResponse(error.message);
    }
    return unauthorizedResponse();
  }
}
