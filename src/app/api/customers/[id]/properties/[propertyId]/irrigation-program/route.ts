import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import {
  buildControllerGuide,
  defaultWeatherFallback,
  fetchWeeklyWeather,
  propertyLocationFromRecord,
  propertySettingsFromRecord,
  zoneInputFromMapZone,
  type ControllerProgramGuide,
  type WeatherInput,
} from "@/lib/irrigation/runtime-engine";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string; propertyId: string }> };

const CACHE_MS = 6 * 60 * 60 * 1000;

async function resolveWeather(
  property: {
    latitude: number | null;
    longitude: number | null;
    etoOverrideInches: number | null;
    etoWeeklyInches: number | null;
    etoCachedAt: Date | null;
    rainfallWeeklyInches: number | null;
  },
  forceRefresh = false
): Promise<WeatherInput> {
  if (property.etoOverrideInches != null) {
    return {
      weeklyEToInches: property.etoOverrideInches,
      totalRainfallInches: property.rainfallWeeklyInches ?? 0,
      source: "override",
    };
  }

  const cacheValid =
    !forceRefresh &&
    property.etoCachedAt &&
    property.etoWeeklyInches != null &&
    Date.now() - property.etoCachedAt.getTime() < CACHE_MS;

  if (cacheValid) {
    return {
      weeklyEToInches: property.etoWeeklyInches!,
      totalRainfallInches: property.rainfallWeeklyInches ?? 0,
      source: "cache",
    };
  }

  if (property.latitude != null && property.longitude != null) {
    try {
      const result = await fetchWeeklyWeather(property.latitude, property.longitude);
      return {
        weeklyEToInches: result.weeklyEToInches,
        totalRainfallInches: result.totalRainfallInches,
        source: result.source,
      };
    } catch (err) {
      console.error("Open-Meteo fetch failed:", err);
    }
  }

  const fallback = defaultWeatherFallback();
  return {
    weeklyEToInches: fallback.weeklyEToInches,
    totalRainfallInches: fallback.totalRainfallInches,
    source: "open_meteo",
  };
}

async function loadProperty(companyId: string, customerId: string, propertyId: string) {
  return prisma.customerProperty.findFirst({
    where: { id: propertyId, customerId, companyId },
    include: {
      irrigationMapZones: { orderBy: { sortOrder: "asc" } },
    },
  });
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id: customerId, propertyId } = await params;
    const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";

    const property = await loadProperty(user.companyId, customerId, propertyId);
    if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const weather = await resolveWeather(property, forceRefresh);

    if (
      forceRefresh &&
      property.latitude != null &&
      property.longitude != null &&
      weather.source === "open_meteo"
    ) {
      await prisma.customerProperty.update({
        where: { id: propertyId },
        data: {
          etoWeeklyInches: weather.weeklyEToInches,
          rainfallWeeklyInches: weather.totalRainfallInches,
          etoCachedAt: new Date(),
        },
      });
    }

    const settings = propertySettingsFromRecord(property);
    const location = propertyLocationFromRecord(property);
    const zones = property.irrigationMapZones.map((z) => zoneInputFromMapZone(z));

    const guide: ControllerProgramGuide = buildControllerGuide({
      propertyId,
      settings,
      zones,
      weather,
      location,
    });

    return NextResponse.json({
      guide,
      settings,
      weather,
      zoneCount: zones.length,
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id: customerId, propertyId } = await params;
    const body = await request.json();

    const property = await loadProperty(user.companyId, customerId, propertyId);
    if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.customerProperty.update({
      where: { id: propertyId },
      data: {
        ...(body.grassSeason !== undefined ? { grassSeason: body.grassSeason } : {}),
        ...(body.droughtRestrictionsActive !== undefined
          ? { droughtRestrictionsActive: Boolean(body.droughtRestrictionsActive) }
          : {}),
        ...(body.cycleSoakEnabled !== undefined
          ? { cycleSoakEnabled: Boolean(body.cycleSoakEnabled) }
          : {}),
        ...(body.etoOverrideInches !== undefined
          ? {
              etoOverrideInches:
                body.etoOverrideInches != null ? Number(body.etoOverrideInches) : null,
            }
          : {}),
      },
    });

    const updated = await loadProperty(user.companyId, customerId, propertyId);
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const weather = await resolveWeather(updated);
    const settings = propertySettingsFromRecord(updated);
    const location = propertyLocationFromRecord(updated);
    const zones = updated.irrigationMapZones.map((z) => zoneInputFromMapZone(z));

    const guide = buildControllerGuide({
      propertyId,
      settings,
      zones,
      weather,
      location,
    });

    await prisma.customerProperty.update({
      where: { id: propertyId },
      data: { programGuideJson: guide as object },
    });

    return NextResponse.json({ guide, settings, weather });
  } catch {
    return unauthorizedResponse();
  }
}
