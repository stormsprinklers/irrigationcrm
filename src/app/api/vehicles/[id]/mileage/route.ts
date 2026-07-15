import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { computeOilDue } from "@/lib/vehicles/oil";
import { canContributeVehicles } from "@/lib/vehicles/permissions";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canContributeVehicles(user.role)) return forbiddenResponse();
    const { id } = await params;

    const logs = await prisma.vehicleMileageLog.findMany({
      where: { vehicleId: id, vehicle: { companyId: user.companyId } },
      orderBy: { recordedAt: "desc" },
      take: 50,
      include: { recordedBy: { select: { id: true, name: true } } },
    });

    return NextResponse.json(logs);
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canContributeVehicles(user.role)) return forbiddenResponse();
    const { id } = await params;

    const vehicle = await prisma.vehicle.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!vehicle) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const mileage = Math.max(0, Math.round(Number(body.mileage)));
    if (!Number.isFinite(mileage)) return badRequestResponse("mileage is required");
    const note = body.note ? String(body.note).trim() : null;
    const recordedAt = body.recordedAt ? new Date(body.recordedAt) : new Date();

    const log = await prisma.vehicleMileageLog.create({
      data: {
        vehicleId: id,
        mileage,
        note,
        recordedAt,
        recordedById: user.id,
      },
      include: { recordedBy: { select: { id: true, name: true } } },
    });

    const shouldUpdateMileage = mileage >= vehicle.currentMileage;
    if (shouldUpdateMileage) {
      const due = computeOilDue({
        lastOilChangeAt: vehicle.lastOilChangeAt,
        lastOilChangeMileage: vehicle.lastOilChangeMileage,
        oilIntervalMiles: vehicle.oilIntervalMiles,
        oilIntervalMonths: vehicle.oilIntervalMonths,
        currentMileage: mileage,
      });
      await prisma.vehicle.update({
        where: { id },
        data: {
          currentMileage: mileage,
          nextOilChangeDueAt: due.nextOilChangeDueAt,
          nextOilChangeDueMileage: due.nextOilChangeDueMileage,
        },
      });
    }

    return NextResponse.json(log, { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
