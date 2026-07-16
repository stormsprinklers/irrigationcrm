import { NextRequest, NextResponse } from "next/server";
import { VehicleStatus } from "@prisma/client";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { computeOilDue } from "@/lib/vehicles/oil";
import { canManageVehicles, canViewVehicles } from "@/lib/vehicles/permissions";
import { getVehicleDetail } from "@/lib/vehicles/queries";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canViewVehicles(user.role)) return forbiddenResponse();
    const { id } = await params;

    const vehicle = await getVehicleDetail(user.companyId, id);
    if (!vehicle) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
      vehicle,
      canManage: canManageVehicles(user.role),
      canContribute: true,
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageVehicles(user.role)) return forbiddenResponse();
    const { id } = await params;

    const existing = await prisma.vehicle.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (body.make !== undefined) {
      const make = String(body.make).trim();
      if (!make) return badRequestResponse("make is required");
      data.make = make;
    }
    if (body.model !== undefined) {
      const model = String(body.model).trim();
      if (!model) return badRequestResponse("model is required");
      data.model = model;
    }
    if (body.year !== undefined) {
      const year = Number(body.year);
      if (!Number.isFinite(year)) return badRequestResponse("Invalid year");
      data.year = Math.round(year);
    }
    if (body.vin !== undefined) {
      data.vin = body.vin ? String(body.vin).trim().toUpperCase() : null;
      if (data.vin) {
        const dup = await prisma.vehicle.findFirst({
          where: {
            companyId: user.companyId,
            vin: data.vin as string,
            NOT: { id },
          },
          select: { id: true },
        });
        if (dup) return badRequestResponse("A vehicle with this VIN already exists");
      }
    }
    if (body.licensePlate !== undefined) {
      data.licensePlate = body.licensePlate
        ? String(body.licensePlate).trim().toUpperCase()
        : null;
    }
    if (body.assignedUserId !== undefined) {
      const assignedUserId =
        body.assignedUserId === null ||
        body.assignedUserId === "" ||
        body.assignedUserId === "shop"
          ? null
          : String(body.assignedUserId);
      if (assignedUserId) {
        const assignee = await prisma.user.findFirst({
          where: { id: assignedUserId, companyId: user.companyId },
          select: { id: true },
        });
        if (!assignee) return badRequestResponse("Invalid assignee");
      }
      data.assignedUserId = assignedUserId;
    }
    if (body.status !== undefined) {
      if (!Object.values(VehicleStatus).includes(body.status)) {
        return badRequestResponse("Invalid status");
      }
      data.status = body.status;
    }
    if (body.notes !== undefined) {
      const raw = body.notes == null ? "" : String(body.notes);
      data.notes = raw.trim() ? raw.trim() : null;
    }
    if (body.oilIntervalMiles !== undefined) {
      data.oilIntervalMiles = Math.max(1, Number(body.oilIntervalMiles) || 5000);
    }
    if (body.oilIntervalMonths !== undefined) {
      data.oilIntervalMonths = Math.max(1, Number(body.oilIntervalMonths) || 6);
    }
    if (body.lastOilChangeAt !== undefined) {
      data.lastOilChangeAt = body.lastOilChangeAt ? new Date(body.lastOilChangeAt) : null;
    }
    if (body.lastOilChangeMileage !== undefined) {
      data.lastOilChangeMileage =
        body.lastOilChangeMileage != null && body.lastOilChangeMileage !== ""
          ? Math.max(0, Number(body.lastOilChangeMileage))
          : null;
    }
    if (body.currentMileage !== undefined) {
      data.currentMileage = Math.max(0, Number(body.currentMileage) || 0);
    }

    const oilChanged =
      body.oilIntervalMiles !== undefined ||
      body.oilIntervalMonths !== undefined ||
      body.lastOilChangeAt !== undefined ||
      body.lastOilChangeMileage !== undefined ||
      body.currentMileage !== undefined;

    if (oilChanged) {
      const due = computeOilDue({
        lastOilChangeAt:
          (data.lastOilChangeAt as Date | null | undefined) ?? existing.lastOilChangeAt,
        lastOilChangeMileage:
          (data.lastOilChangeMileage as number | null | undefined) ??
          existing.lastOilChangeMileage,
        oilIntervalMiles:
          (data.oilIntervalMiles as number | undefined) ?? existing.oilIntervalMiles,
        oilIntervalMonths:
          (data.oilIntervalMonths as number | undefined) ?? existing.oilIntervalMonths,
        currentMileage:
          (data.currentMileage as number | undefined) ?? existing.currentMileage,
      });
      data.nextOilChangeDueAt = due.nextOilChangeDueAt;
      data.nextOilChangeDueMileage = due.nextOilChangeDueMileage;
      if (
        body.lastOilChangeAt !== undefined ||
        body.lastOilChangeMileage !== undefined
      ) {
        data.lastOilReminderSentAt = null;
      }
    }

    const vehicle = await prisma.vehicle.update({
      where: { id },
      data,
      include: {
        assignedUser: { select: { id: true, name: true, photoUrl: true } },
      },
    });

    return NextResponse.json({
      ...vehicle,
      notes: vehicle.notes,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("[vehicles PATCH]", error);
    const message =
      error instanceof Error ? error.message : "Failed to update vehicle";
    // Surface schema/DB errors instead of masking as 401.
    if (/notes|column|Unknown arg/i.test(message)) {
      return NextResponse.json(
        { error: "Could not save notes. The database may need a schema update." },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageVehicles(user.role)) return forbiddenResponse();
    const { id } = await params;

    const result = await prisma.vehicle.deleteMany({
      where: { id, companyId: user.companyId },
    });
    if (!result.count) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
