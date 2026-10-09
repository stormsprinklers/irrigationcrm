import { NextRequest, NextResponse } from "next/server";
import { IntegrationType } from "@prisma/client";
import { authenticateIntegration, isIntegrationContext } from "@/lib/integrations/auth";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  const auth = await authenticateIntegration(request, IntegrationType.DESIGN);
  if (!isIntegrationContext(auth)) return auth;
  const { id } = await params;
  const property = await prisma.customerProperty.findFirst({
    where: { id, companyId: auth.companyId },
    select: {
      id: true, customerId: true, name: true, address: true, city: true, state: true, zip: true,
      aerialImageUrl: true, aerialCenterLat: true, aerialCenterLng: true, aerialZoom: true, mapBounds: true,
      irrigationMapZones: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, polygonGeoJson: true, vegetationType: true, irrigationType: true, shadeLevel: true, slopeLevel: true, soilType: true },
      },
    },
  });
  if (!property) return NextResponse.json({ error: "Property not found" }, { status: 404 });
  return NextResponse.json({ property });
}
