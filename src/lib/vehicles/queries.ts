import type { VehicleIssueStatus, VehicleStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeOilDue } from "@/lib/vehicles/oil";

export type VehicleListFilters = {
  companyId: string;
  q?: string | null;
  status?: VehicleStatus | "ALL" | null;
  assignee?: "shop" | string | null;
};

const OPEN_ISSUE_STATUSES: VehicleIssueStatus[] = ["OPEN", "IN_PROGRESS"];

export async function listVehicles(filters: VehicleListFilters) {
  const q = filters.q?.trim();
  const status = filters.status && filters.status !== "ALL" ? filters.status : undefined;

  const vehicles = await prisma.vehicle.findMany({
    where: {
      companyId: filters.companyId,
      ...(status ? { status } : {}),
      ...(filters.assignee === "shop"
        ? { assignedUserId: null }
        : filters.assignee
          ? { assignedUserId: filters.assignee }
          : {}),
      ...(q
        ? {
            OR: [
              { make: { contains: q, mode: "insensitive" } },
              { model: { contains: q, mode: "insensitive" } },
              { vin: { contains: q, mode: "insensitive" } },
              { licensePlate: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ status: "asc" }, { year: "desc" }, { make: "asc" }, { model: "asc" }],
    select: {
      id: true,
      make: true,
      model: true,
      year: true,
      vin: true,
      licensePlate: true,
      photoUrl: true,
      assignedUserId: true,
      status: true,
      currentMileage: true,
      nextOilChangeDueAt: true,
      nextOilChangeDueMileage: true,
      lastOilChangeAt: true,
      lastOilChangeMileage: true,
      oilIntervalMiles: true,
      oilIntervalMonths: true,
      assignedUser: { select: { id: true, name: true, photoUrl: true } },
      _count: {
        select: {
          issues: { where: { status: { in: OPEN_ISSUE_STATUSES } } },
        },
      },
    },
  });

  return vehicles.map(({ _count, ...v }) => ({
    ...v,
    openIssueCount: _count.issues,
  }));
}

export async function getVehicleDetail(companyId: string, id: string) {
  return prisma.vehicle.findFirst({
    where: { id, companyId },
    include: {
      assignedUser: { select: { id: true, name: true, photoUrl: true } },
      attachments: {
        orderBy: { createdAt: "desc" },
        include: { uploadedBy: { select: { id: true, name: true } } },
      },
      mileageLogs: {
        orderBy: { recordedAt: "desc" },
        take: 50,
        include: { recordedBy: { select: { id: true, name: true } } },
      },
      serviceRecords: {
        orderBy: { performedAt: "desc" },
        include: { performedBy: { select: { id: true, name: true } } },
      },
      issues: {
        orderBy: [{ status: "asc" }, { reportedAt: "desc" }],
        include: {
          reportedBy: { select: { id: true, name: true } },
          resolvedBy: { select: { id: true, name: true } },
        },
      },
    },
  });
}

export async function getCompanyEmployees(companyId: string) {
  return prisma.user.findMany({
    where: { companyId, status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, photoUrl: true, role: true },
  });
}

/** Recompute and persist oil due fields from current oil/mileage state. */
export async function refreshVehicleOilDue(vehicleId: string) {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: {
      lastOilChangeAt: true,
      lastOilChangeMileage: true,
      oilIntervalMiles: true,
      oilIntervalMonths: true,
      currentMileage: true,
    },
  });
  if (!vehicle) return null;

  const due = computeOilDue(vehicle);
  return prisma.vehicle.update({
    where: { id: vehicleId },
    data: {
      nextOilChangeDueAt: due.nextOilChangeDueAt,
      nextOilChangeDueMileage: due.nextOilChangeDueMileage,
    },
  });
}
