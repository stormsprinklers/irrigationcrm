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
  computeHolidayQuotePricing,
  type PriceLookup,
} from "@/lib/holiday-lighting/pricing";
import {
  EMPTY_HOLIDAY_MEASUREMENTS,
  applyHolidayCatalogPolicy,
  holidayDesignOptionsFromQuote,
  holidaySelectionsFromCatalog,
  parseHolidayMeasurements,
  parseHolidaySelections,
  type HolidayLightingCatalog,
} from "@/lib/holiday-lighting/types";
import { applyHolidayPricingSnapshot } from "@/lib/holiday-lighting/quote-prices";
import { prisma } from "@/lib/prisma";

function calculateDraftPriceTotals(
  measurementsValue: unknown,
  selectionsValue: unknown,
  catalog: HolidayLightingCatalog,
  prices: PriceLookup
) {
  try {
    const measurements = parseHolidayMeasurements(measurementsValue);
    const selections = applyHolidayCatalogPolicy(
      parseHolidaySelections(selectionsValue),
      catalog
    );
    const quotePrices = applyHolidayPricingSnapshot(prices, selections.pricingSnapshot);
    return holidayDesignOptionsFromQuote({ measurements, selections, catalog }).map((design) => {
      const designSelections = applyHolidayCatalogPolicy(design.selections, catalog);
      const style = catalog.lightStyles.find(
        (item) => item.key === designSelections.defaultLightStyleKey
      ) ?? catalog.lightStyles[0];
      const pricing = computeHolidayQuotePricing({
        catalog,
        measurements: parseHolidayMeasurements(design.measurements),
        selections: designSelections,
        prices: quotePrices,
      });
      return style?.kind === "permanent"
        ? pricing.optionDetails.permanent.total
        : pricing.optionDetails.buy.total;
    });
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request);
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { name: true, irrigationFeaturesEnabled: true, holidayLightingFeaturesEnabled: true },
    });
    assertHolidayLightingEnabled(company ?? {});

    const customerId = request.nextUrl.searchParams.get("customerId");
    const search = request.nextUrl.searchParams.get("search")?.trim() ?? "";
    const searchTerms = search
      .split(/[\s,]+/)
      .map((term) => term.trim())
      .filter(Boolean)
      .slice(0, 10);
    const page = Math.max(
      1,
      Math.min(100_000, Math.floor(Number(request.nextUrl.searchParams.get("page")) || 1))
    );
    const pageSize = Math.max(
      10,
      Math.min(100, Math.floor(Number(request.nextUrl.searchParams.get("pageSize")) || 25))
    );
    const where = {
      companyId: user.companyId,
      ...(customerId ? { customerId } : {}),
      ...(searchTerms.length
        ? {
            AND: searchTerms.map((term) => ({
              OR: [
                { customer: { is: { name: { contains: term, mode: "insensitive" as const } } } },
                { address: { contains: term, mode: "insensitive" as const } },
                { city: { contains: term, mode: "insensitive" as const } },
                { state: { contains: term, mode: "insensitive" as const } },
                { zip: { contains: term, mode: "insensitive" as const } },
                { property: { is: { address: { contains: term, mode: "insensitive" as const } } } },
                { property: { is: { city: { contains: term, mode: "insensitive" as const } } } },
                { property: { is: { state: { contains: term, mode: "insensitive" as const } } } },
                { property: { is: { zip: { contains: term, mode: "insensitive" as const } } } },
              ],
            })),
          }
        : {}),
    };
    const [quotes, total] = await Promise.all([
      prisma.holidayLightingQuote.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          customer: { select: { id: true, name: true } },
          estimate: {
            select: {
              id: true,
              estimateNumber: true,
              status: true,
              total: true,
              options: {
                where: { declinedAt: null },
                select: { total: true },
              },
            },
          },
        },
      }),
      prisma.holidayLightingQuote.count({ where }),
    ]);

    const needsDraftPricing = quotes.some((quote) => {
      const optionTotals = quote.estimate?.options ?? [];
      return optionTotals.length === 0 && Number(quote.estimate?.total ?? 0) <= 0;
    });
    let draftPricing: { catalog: HolidayLightingCatalog; prices: PriceLookup } | null = null;
    if (needsDraftPricing) {
      const catalog = await loadHolidayCatalog(user.companyId);
      const priceRows = await ensureHolidayPriceBookItems(user.companyId, catalog);
      const prices: PriceLookup = new Map(
        priceRows.map((row) => [
          row.sku,
          {
            id: row.priceBookItemId ?? row.sku,
            name: row.name,
            unitPrice: row.unitPrice,
            unitCost: row.unitCost,
            backendItems: row.backendItems,
          },
        ])
      );
      draftPricing = { catalog, prices };
    }

    const quotesWithPriceRange = quotes.map((quote) => {
      const optionTotals = (quote.estimate?.options ?? [])
        .map((option) => Number(option.total))
        .filter((value) => Number.isFinite(value));
      const estimateTotal = Number(quote.estimate?.total ?? 0);
      let totals = optionTotals.length
        ? optionTotals
        : estimateTotal > 0
          ? [estimateTotal]
          : [];
      if (!totals.length && draftPricing) {
        totals = calculateDraftPriceTotals(
          quote.measurements,
          quote.selections,
          draftPricing.catalog,
          draftPricing.prices
        );
      }
      const priceRange = totals.length
        ? { min: Math.min(...totals), max: Math.max(...totals) }
        : null;
      const estimate = quote.estimate
        ? {
            id: quote.estimate.id,
            estimateNumber: quote.estimate.estimateNumber,
            status: quote.estimate.status,
          }
        : null;
      return { ...quote, estimate, priceRange };
    });
    return NextResponse.json({ quotes: quotesWithPriceRange, total, page, pageSize });
  } catch (error) {
    if (error instanceof Error && error.message.includes("disabled")) {
      return forbiddenResponse(error.message);
    }
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request);
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { name: true, irrigationFeaturesEnabled: true, holidayLightingFeaturesEnabled: true },
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
    const requestedSelections = body.selections
      ? applyHolidayCatalogPolicy(parseHolidaySelections(body.selections), catalog)
      : holidaySelectionsFromCatalog(catalog);
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
        selections: requestedSelections,
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
