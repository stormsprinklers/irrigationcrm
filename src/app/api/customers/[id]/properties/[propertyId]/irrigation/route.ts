import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string; propertyId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id: customerId, propertyId } = await params;

    const property = await prisma.customerProperty.findFirst({
      where: { id: propertyId, customerId, companyId: user.companyId },
      include: { irrigationZones: { orderBy: { sortOrder: "asc" } } },
    });
    if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
      propertyDiagramUrl: property.propertyDiagramUrl,
      zones: property.irrigationZones,
    });
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

    if (body.propertyDiagramUrl !== undefined) {
      await prisma.customerProperty.update({
        where: { id: propertyId },
        data: { propertyDiagramUrl: body.propertyDiagramUrl ? String(body.propertyDiagramUrl) : null },
      });
    }

    if (Array.isArray(body.zones)) {
      await prisma.propertyIrrigationZone.deleteMany({ where: { propertyId } });
      await prisma.propertyIrrigationZone.createMany({
        data: body.zones.map((z: Record<string, unknown>, index: number) => ({
          propertyId,
          stationNumber: Number(z.stationNumber) || index + 1,
          name: String(z.name ?? `Station ${index + 1}`),
          mapX: z.mapX != null ? Number(z.mapX) : null,
          mapY: z.mapY != null ? Number(z.mapY) : null,
          wateringGuide: z.wateringGuide ? String(z.wateringGuide) : null,
          runMinutes: z.runMinutes != null ? Number(z.runMinutes) : null,
          rachioZoneId: z.rachioZoneId ? String(z.rachioZoneId) : null,
          sortOrder: index,
        })),
      });
    }

    const updated = await prisma.customerProperty.findUnique({
      where: { id: propertyId },
      include: { irrigationZones: { orderBy: { sortOrder: "asc" } } },
    });

    return NextResponse.json({
      propertyDiagramUrl: updated?.propertyDiagramUrl,
      zones: updated?.irrigationZones ?? [],
    });
  } catch {
    return unauthorizedResponse();
  }
}
