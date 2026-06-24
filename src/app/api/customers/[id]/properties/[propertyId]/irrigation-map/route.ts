import { NextRequest, NextResponse } from "next/server";
import { IrrigationMapStatus } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { calculateZoneSchedule } from "@/lib/irrigation/runtime";
import type {
  IrrigationType,
  ShadeLevel,
  SlopeLevel,
  SoilType,
  VegetationType,
} from "@/lib/irrigation/types";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string; propertyId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id: customerId, propertyId } = await params;

    const property = await prisma.customerProperty.findFirst({
      where: { id: propertyId, customerId, companyId: user.companyId },
      include: {
        irrigationMapZones: { orderBy: { sortOrder: "asc" } },
        irrigationValves: { orderBy: { sortOrder: "asc" } },
        irrigationControllers: {
          orderBy: { sortOrder: "asc" },
          include: { zoneStations: true },
        },
      },
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
      const mapZones = await prisma.propertyIrrigationMapZone.findMany({
        where: { propertyId },
        orderBy: { sortOrder: "asc" },
      });

      await prisma.propertyIrrigationZone.deleteMany({ where: { propertyId } });
      await prisma.propertyIrrigationZone.createMany({
        data: mapZones.map((zone, index) => {
          const schedule =
            zone.vegetationType && zone.irrigationType
              ? calculateZoneSchedule({
                  vegetationType: zone.vegetationType as VegetationType,
                  irrigationType: zone.irrigationType as IrrigationType,
                  shadeLevel: (zone.shadeLevel as ShadeLevel) ?? "full_sun",
                  soilType: (zone.soilType as SoilType) ?? "loam",
                  slopeLevel: (zone.slopeLevel as SlopeLevel) ?? "flat",
                })
              : null;

          return {
            propertyId,
            stationNumber: index + 1,
            name: zone.name,
            runMinutes: schedule?.adjustedRuntimeMinutes ?? zone.baseRuntimeMinutes,
            wateringGuide: schedule
              ? `${schedule.daysLabel} · ${schedule.startTime}–${schedule.finishTime}`
              : null,
            sortOrder: index,
          };
        }),
      });

      await prisma.customerProperty.update({
        where: { id: propertyId },
        data: { irrigationMapStatus: IrrigationMapStatus.PUBLISHED },
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
          baseRuntimeMinutes:
            z.baseRuntimeMinutes != null ? Number(z.baseRuntimeMinutes) : null,
          sortOrder: index,
        })),
      });
    }

    const updated = await prisma.customerProperty.findFirst({
      where: { id: propertyId },
      include: {
        irrigationMapZones: { orderBy: { sortOrder: "asc" } },
        irrigationZones: { orderBy: { sortOrder: "asc" } },
      },
    });

    return NextResponse.json({ property: updated });
  } catch {
    return unauthorizedResponse();
  }
}
