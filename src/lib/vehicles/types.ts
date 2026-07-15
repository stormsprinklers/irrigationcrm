import type {
  Vehicle,
  VehicleAttachment,
  VehicleAttachmentKind,
  VehicleIssue,
  VehicleIssueStatus,
  VehicleMileageLog,
  VehicleServiceRecord,
  VehicleStatus,
} from "@prisma/client";

export type {
  VehicleAttachmentKind,
  VehicleIssueStatus,
  VehicleStatus,
};

export type VehicleAssignee = {
  id: string;
  name: string;
  photoUrl: string | null;
} | null;

export type VehicleListItem = Pick<
  Vehicle,
  | "id"
  | "make"
  | "model"
  | "year"
  | "vin"
  | "licensePlate"
  | "photoUrl"
  | "assignedUserId"
  | "status"
  | "currentMileage"
  | "nextOilChangeDueAt"
  | "nextOilChangeDueMileage"
  | "lastOilChangeAt"
  | "lastOilChangeMileage"
  | "oilIntervalMiles"
  | "oilIntervalMonths"
> & {
  assignedUser: VehicleAssignee;
  openIssueCount: number;
};

export type VehicleDetail = Vehicle & {
  assignedUser: VehicleAssignee;
  attachments: Array<
    VehicleAttachment & {
      uploadedBy: { id: string; name: string };
    }
  >;
  mileageLogs: Array<
    VehicleMileageLog & {
      recordedBy: { id: string; name: string };
    }
  >;
  serviceRecords: Array<
    VehicleServiceRecord & {
      performedBy: { id: string; name: string } | null;
    }
  >;
  issues: Array<
    VehicleIssue & {
      reportedBy: { id: string; name: string };
      resolvedBy: { id: string; name: string } | null;
    }
  >;
};

export function vehicleDisplayName(v: {
  year: number;
  make: string;
  model: string;
  licensePlate?: string | null;
}) {
  const base = `${v.year} ${v.make} ${v.model}`.trim();
  return v.licensePlate ? `${base} (${v.licensePlate})` : base;
}

export function assigneeLabel(assignedUser: VehicleAssignee) {
  return assignedUser?.name ?? "Shop";
}
