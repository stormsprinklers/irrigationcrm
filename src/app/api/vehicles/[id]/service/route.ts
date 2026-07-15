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

    const records = await prisma.vehicleServiceRecord.findMany({
      where: { vehicleId: id, vehicle: { companyId: user.companyId } },
      orderBy: { performedAt: "desc" },
      include: { performedBy: { select: { id: true, name: true } } },
    });

    return NextResponse.json(records);
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
      select: { id: true },
    });
    if (!vehicle) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const title = String(body.title ?? "").trim();
    if (!title) return badRequestResponse("title is required");

    const performedAt = body.performedAt ? new Date(body.performedAt) : new Date();
    const mileageAtService =
      body.mileageAtService != null && body.mileageAtService !== ""
        ? Math.max(0, Math.round(Number(body.mileageAtService)))
        : null;
    const description = body.description ? String(body.description).trim() : null;
    const vendor = body.vendor ? String(body.vendor).trim() : null;
    const cost =
      body.cost != null && body.cost !== "" ? Number(body.cost) : null;
    if (cost != null && !Number.isFinite(cost)) return badRequestResponse("Invalid cost");

    let performedById: string | null = null;
    if (body.performedById) {
      const performer = await prisma.user.findFirst({
        where: { id: String(body.performedById), companyId: user.companyId },
        select: { id: true },
      });
      if (!performer) return badRequestResponse("Invalid performedById");
      performedById = performer.id;
    } else {
      performedById = user.id;
    }

    const isOilChange =
      Boolean(body.isOilChange) ||
      /oil\s*change/i.test(title) ||
      /oil\s*change/i.test(description ?? "");

    const record = await prisma.$transaction(async (tx) => {
      const created = await tx.vehicleServiceRecord.create({
        data: {
          vehicleId: id,
          title,
          description,
          performedAt,
          mileageAtService,
          cost,
          vendor,
          performedById,
        },
        include: { performedBy: { select: { id: true, name: true } } },
      });

      if (isOilChange) {
        const v = await tx.vehicle.findUnique({ where: { id } });
        if (v) {
          const lastOilChangeMileage = mileageAtService ?? v.currentMileage;
          const due = computeOilDue({
            lastOilChangeAt: performedAt,
            lastOilChangeMileage,
            oilIntervalMiles: v.oilIntervalMiles,
            oilIntervalMonths: v.oilIntervalMonths,
            currentMileage: Math.max(v.currentMileage, lastOilChangeMileage),
          });
          await tx.vehicle.update({
            where: { id },
            data: {
              lastOilChangeAt: performedAt,
              lastOilChangeMileage,
              currentMileage: Math.max(v.currentMileage, lastOilChangeMileage),
              nextOilChangeDueAt: due.nextOilChangeDueAt,
              nextOilChangeDueMileage: due.nextOilChangeDueMileage,
              lastOilReminderSentAt: null,
            },
          });
        }
      }

      return created;
    });

    return NextResponse.json(record, { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
