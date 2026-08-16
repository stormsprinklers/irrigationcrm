import { isOilDueSoon, isOilOverdue, oilStatusLabel } from "@/lib/vehicles/oil";
import { canViewVehicles } from "@/lib/vehicles/permissions";
import { getVehicleDetail, listVehicles } from "@/lib/vehicles/queries";
import { vehicleDisplayName } from "@/lib/vehicles/types";

function iso(date: Date | null | undefined) {
  return date ? date.toISOString() : null;
}

function summarizeVehicle(
  v: Awaited<ReturnType<typeof listVehicles>>[number],
  now = new Date()
) {
  const oil = {
    nextOilChangeDueAt: v.nextOilChangeDueAt,
    nextOilChangeDueMileage: v.nextOilChangeDueMileage,
    currentMileage: v.currentMileage,
  };
  const overdue = isOilOverdue({ ...oil, now });
  const dueSoon = isOilDueSoon({ ...oil, now });
  const milesUntilOil =
    v.nextOilChangeDueMileage != null ? v.nextOilChangeDueMileage - v.currentMileage : null;
  const milesSinceOil =
    v.lastOilChangeMileage != null ? v.currentMileage - v.lastOilChangeMileage : null;

  return {
    id: v.id,
    name: vehicleDisplayName(v),
    year: v.year,
    make: v.make,
    model: v.model,
    licensePlate: v.licensePlate,
    status: v.status,
    assignedTo: v.assignedUser?.name ?? "Shop",
    currentMileage: v.currentMileage,
    lastOilChangeAt: iso(v.lastOilChangeAt),
    lastOilChangeMileage: v.lastOilChangeMileage,
    nextOilChangeDueAt: iso(v.nextOilChangeDueAt),
    nextOilChangeDueMileage: v.nextOilChangeDueMileage,
    oilIntervalMiles: v.oilIntervalMiles,
    oilIntervalMonths: v.oilIntervalMonths,
    oilStatus: oilStatusLabel(oil),
    oilOverdue: overdue,
    oilDueSoon: dueSoon,
    milesUntilOilDue: milesUntilOil,
    milesSinceLastOilChange: milesSinceOil,
    openIssueCount: v.openIssueCount,
    needsService: overdue || dueSoon || v.openIssueCount > 0,
  };
}

export async function getStormAiVehicleReport(
  companyId: string,
  args: { query?: string; vehicleId?: string; focus?: string }
) {
  const focus = (args.focus ?? "all").toLowerCase();
  const list = await listVehicles({
    companyId,
    q: args.query ?? args.vehicleId ?? null,
    status: "ALL",
  });

  let vehicles = list.map((v) => summarizeVehicle(v));
  if (args.vehicleId) {
    vehicles = vehicles.filter((v) => v.id === args.vehicleId);
  }
  if (focus === "needs_service" || focus === "service") {
    vehicles = vehicles.filter((v) => v.oilOverdue || v.oilDueSoon);
  }
  if (focus === "open_issues" || focus === "problems" || focus === "issues") {
    vehicles = vehicles.filter((v) => v.openIssueCount > 0);
  }

  const fleet = {
    vehicleCount: list.length,
    oilOverdue: list.filter((v) =>
      isOilOverdue({
        nextOilChangeDueAt: v.nextOilChangeDueAt,
        nextOilChangeDueMileage: v.nextOilChangeDueMileage,
        currentMileage: v.currentMileage,
      })
    ).length,
    oilDueSoon: list.filter((v) =>
      isOilDueSoon({
        nextOilChangeDueAt: v.nextOilChangeDueAt,
        nextOilChangeDueMileage: v.nextOilChangeDueMileage,
        currentMileage: v.currentMileage,
      })
    ).length,
    withOpenIssues: list.filter((v) => v.openIssueCount > 0).length,
  };

  let detail = null;
  const detailId =
    args.vehicleId ||
    (vehicles.length === 1 ? vehicles[0].id : list.length === 1 ? list[0].id : null);
  if (detailId) {
    const full = await getVehicleDetail(companyId, detailId);
    if (full) {
      detail = {
        ...summarizeVehicle({
          ...full,
          openIssueCount: full.issues.filter(
            (i) => i.status === "OPEN" || i.status === "IN_PROGRESS"
          ).length,
        }),
        notes: full.notes,
        vin: full.vin,
        mileageLogs: full.mileageLogs.slice(0, 12).map((log) => ({
          mileage: log.mileage,
          recordedAt: iso(log.recordedAt),
          recordedBy: log.recordedBy.name,
          note: log.note,
        })),
        recentService: full.serviceRecords.slice(0, 12).map((rec) => ({
          title: rec.title,
          description: rec.description,
          performedAt: iso(rec.performedAt),
          mileageAtService: rec.mileageAtService,
          vendor: rec.vendor,
          cost: rec.cost,
        })),
        issues: full.issues.map((issue) => ({
          title: issue.title,
          description: issue.description,
          status: issue.status,
          reportedAt: iso(issue.reportedAt),
          reportedBy: issue.reportedBy.name,
          resolvedAt: iso(issue.resolvedAt),
          resolutionNote: issue.resolutionNote,
        })),
      };
    }
  }

  return {
    fleet,
    vehicles,
    detail,
    note: "Use fleet + vehicles for overview. detail includes mileage history, service records, and issues when a specific vehicle is identified.",
  };
}
