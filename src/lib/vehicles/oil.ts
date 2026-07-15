export type OilScheduleInput = {
  lastOilChangeAt: Date | null | undefined;
  lastOilChangeMileage: number | null | undefined;
  oilIntervalMiles: number;
  oilIntervalMonths: number;
  currentMileage?: number | null;
};

export type OilDue = {
  nextOilChangeDueAt: Date | null;
  nextOilChangeDueMileage: number | null;
};

export function computeOilDue(input: OilScheduleInput): OilDue {
  const miles = Math.max(1, input.oilIntervalMiles || 5000);
  const months = Math.max(1, input.oilIntervalMonths || 6);

  let nextOilChangeDueAt: Date | null = null;
  if (input.lastOilChangeAt) {
    const due = new Date(input.lastOilChangeAt);
    due.setMonth(due.getMonth() + months);
    nextOilChangeDueAt = due;
  }

  let nextOilChangeDueMileage: number | null = null;
  if (input.lastOilChangeMileage != null && Number.isFinite(input.lastOilChangeMileage)) {
    nextOilChangeDueMileage = input.lastOilChangeMileage + miles;
  }

  return { nextOilChangeDueAt, nextOilChangeDueMileage };
}

export function isOilOverdue(params: {
  nextOilChangeDueAt: Date | null | undefined;
  nextOilChangeDueMileage: number | null | undefined;
  currentMileage: number;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  if (params.nextOilChangeDueAt && params.nextOilChangeDueAt.getTime() <= now.getTime()) {
    return true;
  }
  if (
    params.nextOilChangeDueMileage != null &&
    params.currentMileage >= params.nextOilChangeDueMileage
  ) {
    return true;
  }
  return false;
}

export function isOilDueSoon(params: {
  nextOilChangeDueAt: Date | null | undefined;
  nextOilChangeDueMileage: number | null | undefined;
  currentMileage: number;
  withinDays?: number;
  withinMiles?: number;
  now?: Date;
}) {
  if (isOilOverdue(params)) return true;

  const withinDays = params.withinDays ?? 7;
  const withinMiles = params.withinMiles ?? 500;
  const now = params.now ?? new Date();

  if (params.nextOilChangeDueAt) {
    const windowEnd = new Date(now);
    windowEnd.setDate(windowEnd.getDate() + withinDays);
    if (params.nextOilChangeDueAt.getTime() <= windowEnd.getTime()) return true;
  }

  if (
    params.nextOilChangeDueMileage != null &&
    params.currentMileage + withinMiles >= params.nextOilChangeDueMileage
  ) {
    return true;
  }

  return false;
}

export function oilStatusLabel(params: {
  nextOilChangeDueAt: Date | null | undefined;
  nextOilChangeDueMileage: number | null | undefined;
  currentMileage: number;
}) {
  if (isOilOverdue(params)) return "Overdue";
  if (isOilDueSoon(params)) return "Due soon";
  if (!params.nextOilChangeDueAt && params.nextOilChangeDueMileage == null) return "Not set";
  return "Up to date";
}
