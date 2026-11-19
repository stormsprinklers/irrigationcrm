import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { buildVehicleInventoryPdf } from "@/lib/vehicles/export";
import { canViewVehicles } from "@/lib/vehicles/permissions";

const MAX_EXPORT_ITEMS = 500;

async function exportPdf(companyId: string, ids?: string[]) {
  if (ids && ids.length === 0) return badRequestResponse("Select at least one item to export");
  const selectedIds = ids ? [...new Set(ids.map(String).filter(Boolean))] : undefined;
  if (selectedIds && selectedIds.length > MAX_EXPORT_ITEMS) {
    return badRequestResponse(`Select no more than ${MAX_EXPORT_ITEMS} items`);
  }

  const vehicles = await prisma.vehicle.findMany({
    where: {
      companyId,
      ...(selectedIds ? { id: { in: selectedIds } } : {}),
    },
    orderBy: [{ assetType: "asc" }, { year: "desc" }, { make: "asc" }, { model: "asc" }],
    select: {
      make: true,
      model: true,
      year: true,
      vin: true,
      currentMileage: true,
      estimatedValueCents: true,
    },
  });

  if (selectedIds && vehicles.length !== selectedIds.length) {
    return badRequestResponse("One or more selected items could not be exported");
  }
  if (vehicles.length === 0) return badRequestResponse("No inventory items to export");

  const date = new Date().toISOString().slice(0, 10);
  const pdf = buildVehicleInventoryPdf(vehicles);
  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="vehicle-equipment-inventory-${date}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (!canViewVehicles(user.role)) return forbiddenResponse();
    return exportPdf(user.companyId);
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canViewVehicles(user.role)) return forbiddenResponse();
    const body = await request.json().catch(() => ({}));
    if (!Array.isArray(body.ids)) return badRequestResponse("Select at least one item to export");
    return exportPdf(user.companyId, body.ids);
  } catch {
    return unauthorizedResponse();
  }
}
