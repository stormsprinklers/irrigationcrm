import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePortalCustomer,
  portalNotFoundResponse,
  portalUnauthorizedResponse,
} from "@/lib/portal/auth";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const ctx = await requirePortalCustomer();
  if (!ctx) return portalUnauthorizedResponse();

  const { id: propertyId } = await params;
  const property = await prisma.customerProperty.findFirst({
    where: { id: propertyId, customerId: ctx.customerId, companyId: ctx.companyId },
    include: {
      irrigationZones: { orderBy: { sortOrder: "asc" } },
      irrigationMapZones: { orderBy: { sortOrder: "asc" } },
      irrigationControllers: {
        orderBy: { sortOrder: "asc" },
        include: { zoneStations: true },
      },
    },
  });
  if (!property) return portalNotFoundResponse();

  return NextResponse.json({
    propertyDiagramUrl: property.propertyDiagramUrl,
    aerialImageUrl: property.aerialImageUrl,
    irrigationMapStatus: property.irrigationMapStatus,
    zones: property.irrigationZones.map((z) => ({
      id: z.id,
      stationNumber: z.stationNumber,
      name: z.name,
      mapX: z.mapX,
      mapY: z.mapY,
      wateringGuide: z.wateringGuide,
      runMinutes: z.runMinutes,
      rachioZoneId: z.rachioZoneId,
    })),
    mapZones: property.irrigationMapZones.map((z) => ({
      id: z.id,
      name: z.name,
      vegetationType: z.vegetationType,
      irrigationType: z.irrigationType,
      estimatedGpm: z.estimatedGpm,
      baseRuntimeMinutes: z.baseRuntimeMinutes,
    })),
    controllers: property.irrigationControllers.map((c) => ({
      id: c.id,
      label: c.label,
      stationCount: c.stationCount,
      controllerModelId: c.controllerModelId,
    })),
  });
}
