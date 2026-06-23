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
    },
  });
  if (!property) return portalNotFoundResponse();

  return NextResponse.json({
    propertyDiagramUrl: property.propertyDiagramUrl,
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
  });
}
