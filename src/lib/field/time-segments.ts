import {
  TechTimeCategory,
  TechTimeSegmentSource,
  TimeEventType,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeStaffAuditLog } from "@/lib/audit/staff-audit";

export const LEFT_RUNNING_HOURS = 8;

const CATEGORY_TO_TIME_EVENT: Partial<Record<TechTimeCategory, TimeEventType>> = {
  DRIVING: TimeEventType.EN_ROUTE,
  WORKING: TimeEventType.START,
  PARTS_RUN: TimeEventType.PAUSE,
};

export function serializeTimeSegment(
  segment: Prisma.TechTimeSegmentGetPayload<{ include?: never }>
) {
  const hoursOpen =
    !segment.endedAt
      ? (Date.now() - segment.startedAt.getTime()) / 3_600_000
      : null;
  return {
    id: segment.id,
    category: segment.category,
    visitId: segment.visitId,
    startedAt: segment.startedAt.toISOString(),
    endedAt: segment.endedAt?.toISOString() ?? null,
    source: segment.source,
    deviceId: segment.deviceId,
    leftRunning: hoursOpen != null && hoursOpen >= LEFT_RUNNING_HOURS,
    openHours: hoursOpen,
  };
}

export async function getOpenTimeSegment(companyId: string, userId: string) {
  return prisma.techTimeSegment.findFirst({
    where: { companyId, userId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
}

export async function startTimeSegment(params: {
  companyId: string;
  userId: string;
  category: TechTimeCategory;
  visitId?: string | null;
  source?: TechTimeSegmentSource;
  deviceId?: string | null;
  mapVisitEvents?: boolean;
}) {
  const open = await getOpenTimeSegment(params.companyId, params.userId);
  if (open) {
    throw new Error("An open time segment already exists; stop or pause it first");
  }

  const segment = await prisma.techTimeSegment.create({
    data: {
      companyId: params.companyId,
      userId: params.userId,
      category: params.category,
      visitId: params.visitId ?? null,
      source: params.source ?? TechTimeSegmentSource.MOBILE,
      deviceId: params.deviceId ?? null,
      startedAt: new Date(),
    },
  });

  if (params.mapVisitEvents !== false && params.visitId) {
    const eventType = CATEGORY_TO_TIME_EVENT[params.category];
    if (eventType === TimeEventType.EN_ROUTE || eventType === TimeEventType.START) {
      // Visit time route remains source of truth for status; callers may POST visit time separately.
    }
  }

  await writeStaffAuditLog({
    companyId: params.companyId,
    actorId: params.userId,
    deviceId: params.deviceId,
    entityType: "TechTimeSegment",
    entityId: segment.id,
    action: "start",
    after: { category: segment.category, visitId: segment.visitId },
    visitId: segment.visitId,
  });

  return segment;
}

export async function stopOpenTimeSegment(params: {
  companyId: string;
  userId: string;
  deviceId?: string | null;
}) {
  const open = await getOpenTimeSegment(params.companyId, params.userId);
  if (!open) return null;

  const segment = await prisma.techTimeSegment.update({
    where: { id: open.id },
    data: { endedAt: new Date() },
  });

  await writeStaffAuditLog({
    companyId: params.companyId,
    actorId: params.userId,
    deviceId: params.deviceId,
    entityType: "TechTimeSegment",
    entityId: segment.id,
    action: "stop",
    before: { endedAt: null },
    after: { endedAt: segment.endedAt },
    visitId: segment.visitId,
  });

  return segment;
}

export function visitEventTypeForCategory(category: TechTimeCategory): TimeEventType | null {
  return CATEGORY_TO_TIME_EVENT[category] ?? null;
}
