import { NextRequest, NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { assertHolidayLightingEnabled } from "@/lib/holiday-lighting/catalog";
import {
  ensureHolidayPriceBookItems,
  updateHolidayPriceBookPrices,
} from "@/lib/holiday-lighting/price-book";
import { parseHolidayCatalog } from "@/lib/holiday-lighting/types";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { holidayLightingFeaturesEnabled: true, holidayLightingCatalog: true },
    });
    assertHolidayLightingEnabled(company ?? {});
    const catalog = parseHolidayCatalog(company?.holidayLightingCatalog);
    const prices = await ensureHolidayPriceBookItems(user.companyId, catalog);
    return NextResponse.json({
      catalog,
      defaults: catalog.quoteDefaults,
      prices,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("disabled")) {
      return forbiddenResponse(error.message);
    }
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return forbiddenResponse();
    }
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { holidayLightingFeaturesEnabled: true },
    });
    assertHolidayLightingEnabled(company ?? {});

    const body = await request.json();
    const catalog = parseHolidayCatalog(body.catalog ?? body);
    const updated = await prisma.company.update({
      where: { id: user.companyId },
      data: { holidayLightingCatalog: catalog },
      select: { holidayLightingCatalog: true },
    });
    const parsed = parseHolidayCatalog(updated.holidayLightingCatalog);
    await ensureHolidayPriceBookItems(user.companyId, parsed);
    if (Array.isArray(body.prices)) {
      await updateHolidayPriceBookPrices(user.companyId, body.prices);
    }
    const prices = await ensureHolidayPriceBookItems(user.companyId, parsed);
    return NextResponse.json({ catalog: parsed, prices });
  } catch (error) {
    if (error instanceof Error && error.message.includes("disabled")) {
      return forbiddenResponse(error.message);
    }
    return unauthorizedResponse();
  }
}
