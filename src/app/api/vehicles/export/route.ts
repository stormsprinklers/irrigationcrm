import { NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { buildVehicleExportCsv } from "@/lib/vehicles/export";
import { canViewVehicles } from "@/lib/vehicles/permissions";

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (!canViewVehicles(user.role)) return forbiddenResponse();

    const vehicles = await prisma.vehicle.findMany({
      where: { companyId: user.companyId },
      orderBy: [{ vehicleNumber: "asc" }, { year: "desc" }, { make: "asc" }, { model: "asc" }],
      select: {
        vehicleNumber: true,
        licensePlate: true,
        year: true,
        make: true,
        model: true,
        vin: true,
        currentMileage: true,
      },
    });

    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(buildVehicleExportCsv(vehicles), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="vehicles-${date}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return unauthorizedResponse();
  }
}
