import { NextRequest, NextResponse } from "next/server";
import { IntegrationType } from "@prisma/client";
import { authenticateIntegration, isIntegrationContext } from "@/lib/integrations/auth";
import { logIntegrationAudit } from "@/lib/integrations/audit";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const auth = await authenticateIntegration(request, IntegrationType.MAPS);
  if (!isIntegrationContext(auth)) return auth;

  const body = await request.json();
  const properties = Array.isArray(body.properties) ? body.properties : [];

  let imported = 0;
  for (const item of properties) {
    const customerId = String(item.customerId ?? "").trim();
    const propertyId = String(item.propertyId ?? "").trim();
    if (!customerId || !propertyId) continue;

    const property = await prisma.customerProperty.findFirst({
      where: { id: propertyId, customerId, companyId: auth.companyId },
    });
    if (!property) continue;

    if (item.zones?.length) {
      await prisma.propertyIrrigationMapZone.deleteMany({ where: { propertyId } });
      await prisma.propertyIrrigationMapZone.createMany({
        data: item.zones.map((z: Record<string, unknown>, index: number) => ({
          propertyId,
          name: String(z.name ?? `Zone ${index + 1}`),
          polygonGeoJson: z.geometry ?? z.polygonGeoJson ?? { type: "Polygon", coordinates: [] },
          vegetationType: z.vegetation_type ? String(z.vegetation_type) : null,
          shadeLevel: z.shade_level ? String(z.shade_level) : null,
          slopeLevel: z.slope_level ? String(z.slope_level) : null,
          soilType: z.soil_type ? String(z.soil_type) : null,
          irrigationType: z.irrigation_type ? String(z.irrigation_type) : null,
          nozzleCount: z.nozzle_count != null ? Number(z.nozzle_count) : null,
          estimatedGpm: z.estimated_gpm != null ? Number(z.estimated_gpm) : null,
          baseRuntimeMinutes:
            z.base_runtime_minutes != null ? Number(z.base_runtime_minutes) : null,
          sortOrder: index,
        })),
      });
      imported += 1;
    }
  }

  await logIntegrationAudit({
    companyId: auth.companyId,
    integrationType: IntegrationType.MAPS,
    action: "maps.import",
    payload: { count: properties.length },
    status: "success",
  });

  return NextResponse.json({ imported, total: properties.length });
}
