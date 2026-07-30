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

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { holidayLightingFeaturesEnabled: true, holidayLightingCatalog: true },
    });
    assertHolidayLightingEnabled(company ?? {});

    const { id } = await params;
    const quote = await loadOwnedQuote(user.companyId, id);
    if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const catalog = await loadHolidayCatalog(user.companyId);
    const prices = await loadHolidayPriceLookup(user.companyId);
    const pricing = computeHolidayQuotePricing({
      catalog,
      measurements: parseHolidayMeasurements(quote.measurements),
      selections: parseHolidaySelections(quote.selections),
      prices,
    });

    return NextResponse.json({ quote, catalog, pricing });
  } catch (error) {
    if (error instanceof Error && error.message.includes("disabled")) {
      return forbiddenResponse(error.message);
    }
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { holidayLightingFeaturesEnabled: true },
    });
    assertHolidayLightingEnabled(company ?? {});

    const { id } = await params;
    const existing = await loadOwnedQuote(user.companyId, id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
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
    if ("selections" in body) data.selections = parseHolidaySelections(body.selections);

    const quote = await prisma.holidayLightingQuote.update({
      where: { id },
      data,
      include: {
        customer: { select: { id: true, name: true, email: true, phone: true } },
        estimate: { select: { id: true, estimateNumber: true, status: true, publicToken: true } },
      },
    });

    const catalog = await loadHolidayCatalog(user.companyId);
    const prices = await loadHolidayPriceLookup(user.companyId);
    const pricing = computeHolidayQuotePricing({
      catalog,
      measurements: parseHolidayMeasurements(quote.measurements),
      selections: parseHolidaySelections(quote.selections),
      prices,
    });

    return NextResponse.json({ quote, pricing });
  } catch (error) {
    if (error instanceof Error && error.message.includes("disabled")) {
      return forbiddenResponse(error.message);
    }
    console.error(error);
    return badRequestResponse(error instanceof Error ? error.message : "Update failed");
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { holidayLightingFeaturesEnabled: true },
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
