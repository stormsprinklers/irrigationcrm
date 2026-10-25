import { VisitStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const SCHEDULED_VISIT_STATUSES: VisitStatus[] = [
  VisitStatus.SCHEDULED,
  VisitStatus.EN_ROUTE,
  VisitStatus.IN_PROGRESS,
  VisitStatus.PAUSED,
  VisitStatus.COMPLETED,
];

export function visitCountsAsScheduled(status: VisitStatus) {
  return SCHEDULED_VISIT_STATUSES.includes(status);
}

export async function clearNeedsSchedulingForVisit(visitId: string) {
  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    select: { companyId: true, estimateId: true, status: true },
  });
  if (!visit || !visitCountsAsScheduled(visit.status)) return;

  await prisma.estimate.updateMany({
    where: {
      companyId: visit.companyId,
      needsScheduling: true,
      OR: [
        { visitId },
        ...(visit.estimateId ? [{ id: visit.estimateId }] : []),
      ],
    },
    data: { needsScheduling: false },
  });
}

/**
 * Repairs legacy estimates whose appointment was scheduled without clearing the
 * queue flag. New writes clear the flag immediately, but this keeps every queue
 * and dashboard count correct for older records too.
 */
export async function reconcileNeedsSchedulingEstimates(companyId: string) {
  const pending = await prisma.estimate.findMany({
    where: { companyId, needsScheduling: true },
    select: {
      id: true,
      visit: { select: { status: true } },
    },
  });
  if (!pending.length) return 0;

  const pendingIds = pending.map((estimate) => estimate.id);
  const visitsLinkedByEstimateId = await prisma.visit.findMany({
    where: {
      companyId,
      estimateId: { in: pendingIds },
      status: { in: SCHEDULED_VISIT_STATUSES },
    },
    select: { estimateId: true },
  });

  const scheduledEstimateIds = new Set(
    pending
      .filter((estimate) => estimate.visit && visitCountsAsScheduled(estimate.visit.status))
      .map((estimate) => estimate.id)
  );
  for (const visit of visitsLinkedByEstimateId) {
    if (visit.estimateId) scheduledEstimateIds.add(visit.estimateId);
  }
  if (!scheduledEstimateIds.size) return 0;

  const result = await prisma.estimate.updateMany({
    where: {
      companyId,
      id: { in: [...scheduledEstimateIds] },
      needsScheduling: true,
    },
    data: { needsScheduling: false },
  });
  return result.count;
}
