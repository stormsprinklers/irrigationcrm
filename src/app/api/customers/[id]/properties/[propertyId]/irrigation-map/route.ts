import { NextRequest, NextResponse } from "next/server";
import { IrrigationMapStatus } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import {
  buildControllerGuide,
  calculateZoneRuntime,
  defaultWeatherFallback,
  fetchWeeklyWeather,
  propertyLocationFromRecord,
  propertySettingsFromRecord,
  zoneInputFromMapZone,
} from "@/lib/irrigation/runtime-engine";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string; propertyId: string }> };

const propertyInclude = {
  irrigationMapZones: { orderBy: { sortOrder: "asc" as const } },
  irrigationValves: { orderBy: { sortOrder: "asc" as const } },
  irrigationControllers: {
    orderBy: { sortOrder: "asc" as const },
    include: { zoneStations: true },
  },
  irrigationMapMarkers: { orderBy: { sortOrder: "asc" as const } },
};

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id: customerId, propertyId } = await params;

    const property = await prisma.customerProperty.findFirst({
      where: { id: propertyId, customerId, companyId: user.companyId },
      include: propertyInclude,
    });
    if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ property });
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id: customerId, propertyId } = await params;
    const body = await request.json();

    const property = await prisma.customerProperty.findFirst({
      where: { id: propertyId, customerId, companyId: user.companyId },
    });
    if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (body.publish) {
      const fullProperty = await prisma.customerProperty.findFirst({
        where: { id: propertyId },
        include: { irrigationMapZones: { orderBy: { sortOrder: "asc" } } },
      });

      const mapZones = fullProperty?.irrigationMapZones ?? [];

      let weather = defaultWeatherFallback();
      if (fullProperty?.latitude != null && fullProperty?.longitude != null) {
        try {
          weather = await fetchWeeklyWeather(fullProperty.latitude, fullProperty.longitude);
          await prisma.customerProperty.update({
            where: { id: propertyId },
            data: {
              etoWeeklyInches: weather.weeklyEToInches,
              rainfallWeeklyInches: weather.totalRainfallInches,
              etoCachedAt: new Date(),
            },
          });
        } catch (err) {
          console.error("Weather fetch on publish failed:", err);
        }
      }

      const settings = propertySettingsFromRecord(fullProperty ?? {});
      const location = propertyLocationFromRecord(fullProperty ?? {});
      const zoneInputs = mapZones.map((z) => zoneInputFromMapZone(z));
      const weatherInput = {
        weeklyEToInches: settings.etoOverrideInches ?? weather.weeklyEToInches,
        totalRainfallInches: weather.totalRainfallInches,
        source: weather.source as "open_meteo",
      };

      const guide = buildControllerGuide({
        propertyId,
        settings,
        zones: zoneInputs,
        weather: weatherInput,
        location,
      });

      for (const [index, zone] of mapZones.entries()) {
        const input = zoneInputFromMapZone(zone, index + 1);
        const result = calculateZoneRuntime(input, settings, weatherInput);
        if (result) {
          await prisma.propertyIrrigationMapZone.update({
            where: { id: zone.id },
            data: {
              baseRuntimeMinutes: result.runtimePerEventMinutes,
              computedWeeklyRuntimeMinutes: result.weeklyRuntimeMinutes,
              computedGallonsPerWeek: result.gallonsPerWeek,
            },
          });
        }
      }

      await prisma.propertyIrrigationZone.deleteMany({ where: { propertyId } });
      await prisma.propertyIrrigationZone.createMany({
        data: mapZones.map((zone, index) => {
          const input = zoneInputFromMapZone(zone, index + 1);
          const result = calculateZoneRuntime(input, settings, weatherInput);
          const programZone = guide.programs
            .flatMap((p) => p.zones)
            .find((z) => z.zoneId === zone.id);

          return {
            propertyId,
            stationNumber: index + 1,
            name: zone.name,
            runMinutes: result?.runtimePerEventMinutes ?? zone.baseRuntimeMinutes,
            wateringGuide: programZone
              ? `${result?.daysPerWeek ?? 3} days/week · ${programZone.startTime ?? "5:00 AM"} · ${result?.gallonsPerWeek ?? 0} gal/wk`
              : null,
            sortOrder: index,
          };
        }),
      });

      await prisma.customerProperty.update({
        where: { id: propertyId },
        data: {
          irrigationMapStatus: IrrigationMapStatus.PUBLISHED,
          programGuideJson: guide as object,
        },
      });
    }

    if (body.property) {
      const p = body.property as Record<string, unknown>;
      await prisma.customerProperty.update({
        where: { id: propertyId },
        data: {
          ...(p.latitude != null ? { latitude: Number(p.latitude) } : {}),
          ...(p.longitude != null ? { longitude: Number(p.longitude) } : {}),
          ...(p.aerialImageUrl != null ? { aerialImageUrl: String(p.aerialImageUrl) } : {}),
          ...(p.stylizedImageUrl != null ? { stylizedImageUrl: String(p.stylizedImageUrl) } : {}),
          ...(p.irrigationWizardStep != null
            ? { irrigationWizardStep: Number(p.irrigationWizardStep) }
            : {}),
          ...(p.irrigationZoneCount != null
            ? { irrigationZoneCount: Number(p.irrigationZoneCount) }
            : {}),
          ...(p.waterSource !== undefined
            ? {
                waterSource: p.waterSource ? (p.waterSource as "SECONDARY" | "CULINARY" | "BOTH") : null,
              }
            : {}),
          ...(p.shutoffValveLocation !== undefined
            ? {
                shutoffValveLocation: p.shutoffValveLocation
                  ? String(p.shutoffValveLocation)
                  : null,
              }
            : {}),
          ...(p.controllerLocation !== undefined
            ? {
                controllerLocation: p.controllerLocation
                  ? String(p.controllerLocation)
                  : null,
              }
            : {}),
        },
      });
    }

    if (Array.isArray(body.mapZones)) {
      await prisma.propertyIrrigationMapZone.deleteMany({ where: { propertyId } });
      await prisma.propertyIrrigationMapZone.createMany({
        data: body.mapZones.map((z: Record<string, unknown>, index: number) => ({
          propertyId,
          name: String(z.name ?? `Zone ${index + 1}`),
          polygonGeoJson: z.polygonGeoJson ?? { type: "Polygon", coordinates: [] },
          vegetationType: z.vegetationType ? String(z.vegetationType) : null,
          shadeLevel: z.shadeLevel ? String(z.shadeLevel) : null,
          slopeLevel: z.slopeLevel ? String(z.slopeLevel) : null,
          soilType: z.soilType ? String(z.soilType) : null,
          irrigationType: z.irrigationType ? String(z.irrigationType) : null,
          nozzleCount: z.nozzleCount != null ? Number(z.nozzleCount) : null,
          estimatedGpm: z.estimatedGpm != null ? Number(z.estimatedGpm) : null,
          irrigatedSqFt: z.irrigatedSqFt != null ? Number(z.irrigatedSqFt) : null,
          irrigationEfficiencyScore:
            z.irrigationEfficiencyScore != null
              ? Number(z.irrigationEfficiencyScore)
              : null,
          establishmentStage: z.establishmentStage
            ? (String(z.establishmentStage) as "NORMAL" | "NEW_SOD" | "NEW_SEED")
            : "NORMAL",
          nozzleGpm: z.nozzleGpm != null ? Number(z.nozzleGpm) : null,
          baseRuntimeMinutes:
            z.baseRuntimeMinutes != null ? Number(z.baseRuntimeMinutes) : null,
          sortOrder: index,
        })),
      });
    }

    if (Array.isArray(body.valves)) {
      await prisma.propertyIrrigationValve.deleteMany({ where: { propertyId } });
      await prisma.propertyIrrigationValve.createMany({
        data: body.valves.map((v: Record<string, unknown>, index: number) => ({
          propertyId,
          label: String(v.label ?? `Valve ${index + 1}`),
          pointGeoJson: v.pointGeoJson ?? { type: "Point", coordinates: [] },
          zoneIds: Array.isArray(v.zoneIds) ? v.zoneIds.map(String) : [],
          sortOrder: index,
        })),
      });
    }

    if (Array.isArray(body.controllers)) {
      await prisma.propertyIrrigationController.deleteMany({ where: { propertyId } });
      for (const [index, c] of (body.controllers as Record<string, unknown>[]).entries()) {
        await prisma.propertyIrrigationController.create({
          data: {
            propertyId,
            label: String(c.label ?? `Timer ${index + 1}`),
            pointGeoJson: c.pointGeoJson ?? { type: "Point", coordinates: [] },
            stationCount: c.stationCount != null ? Number(c.stationCount) : 1,
            sortOrder: index,
          },
        });
      }
    }

    if (Array.isArray(body.mapMarkers)) {
      await prisma.propertyIrrigationMapMarker.deleteMany({ where: { propertyId } });
      await prisma.propertyIrrigationMapMarker.createMany({
        data: body.mapMarkers.map((m: Record<string, unknown>, index: number) => ({
          propertyId,
          type: m.type as "POC" | "FILTER" | "BACKFLOW",
          label: m.label ? String(m.label) : null,
          pointGeoJson: m.pointGeoJson ?? { type: "Point", coordinates: [] },
          sortOrder: index,
        })),
      });
    }

    const updated = await prisma.customerProperty.findFirst({
      where: { id: propertyId },
      include: {
        ...propertyInclude,
        irrigationZones: { orderBy: { sortOrder: "asc" } },
      },
    });

    return NextResponse.json({ property: updated });
  } catch {
    return unauthorizedResponse();
  }
}
