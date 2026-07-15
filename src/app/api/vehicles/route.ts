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
import { getCompanyEmployees, listVehicles } from "@/lib/vehicles/queries";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canViewVehicles(user.role)) return forbiddenResponse();

    const q = request.nextUrl.searchParams.get("q");
    const statusParam = request.nextUrl.searchParams.get("status");
    const assignee = request.nextUrl.searchParams.get("assignee");
    const includeEmployees = request.nextUrl.searchParams.get("employees") === "1";

    const status =
      statusParam && Object.values(VehicleStatus).includes(statusParam as VehicleStatus)
        ? (statusParam as VehicleStatus)
        : statusParam === "ALL"
          ? "ALL"
          : null;

    const vehicles = await listVehicles({
      companyId: user.companyId,
      q,
      status,
      assignee,
    });

    const employees = includeEmployees ? await getCompanyEmployees(user.companyId) : undefined;

    return NextResponse.json({ vehicles, employees, canManage: canManageVehicles(user.role) });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageVehicles(user.role)) return forbiddenResponse();

    const body = await request.json();
    const make = String(body.make ?? "").trim();
    const model = String(body.model ?? "").trim();
    const year = Number(body.year);
    if (!make || !model || !Number.isFinite(year)) {
      return badRequestResponse("make, model, and year are required");
    }

    const vin = body.vin ? String(body.vin).trim().toUpperCase() : null;
    const licensePlate = body.licensePlate ? String(body.licensePlate).trim().toUpperCase() : null;
    const assignedUserId =
      body.assignedUserId === null || body.assignedUserId === "" || body.assignedUserId === "shop"
        ? null
        : String(body.assignedUserId);
    const status =
      body.status && Object.values(VehicleStatus).includes(body.status)
        ? (body.status as VehicleStatus)
        : VehicleStatus.ACTIVE;
    const currentMileage = Math.max(0, Number(body.currentMileage) || 0);
    const oilIntervalMiles = Math.max(1, Number(body.oilIntervalMiles) || 5000);
    const oilIntervalMonths = Math.max(1, Number(body.oilIntervalMonths) || 6);
    const lastOilChangeAt = body.lastOilChangeAt ? new Date(body.lastOilChangeAt) : null;
    const lastOilChangeMileage =
      body.lastOilChangeMileage != null && body.lastOilChangeMileage !== ""
        ? Math.max(0, Number(body.lastOilChangeMileage))
        : null;
    const notes = body.notes ? String(body.notes).trim() : null;

    if (assignedUserId) {
      const assignee = await prisma.user.findFirst({
        where: { id: assignedUserId, companyId: user.companyId },
        select: { id: true },
      });
      if (!assignee) return badRequestResponse("Invalid assignee");
    }

    if (vin) {
      const existing = await prisma.vehicle.findFirst({
        where: { companyId: user.companyId, vin },
        select: { id: true },
      });
      if (existing) return badRequestResponse("A vehicle with this VIN already exists");
    }

    const due = computeOilDue({
      lastOilChangeAt,
      lastOilChangeMileage,
      oilIntervalMiles,
      oilIntervalMonths,
      currentMileage,
    });

    const vehicle = await prisma.vehicle.create({
      data: {
        companyId: user.companyId,
        make,
        model,
        year: Math.round(year),
        vin,
        licensePlate,
        assignedUserId,
        status,
        currentMileage,
        oilIntervalMiles,
        oilIntervalMonths,
        lastOilChangeAt,
        lastOilChangeMileage,
        nextOilChangeDueAt: due.nextOilChangeDueAt,
        nextOilChangeDueMileage: due.nextOilChangeDueMileage,
        notes,
      },
      include: {
        assignedUser: { select: { id: true, name: true, photoUrl: true } },
      },
    });

    return NextResponse.json(vehicle, { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
