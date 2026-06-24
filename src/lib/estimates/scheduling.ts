import { VisitStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function clearNeedsSchedulingForVisit(visitId: string) {
  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    select: { estimateId: true, status: true, startAt: true, assignedUserId: true },
  });
  if (!visit?.estimateId) return;

  const isScheduled =
    visit.status === VisitStatus.SCHEDULED ||
    visit.status === VisitStatus.EN_ROUTE ||
    visit.status === VisitStatus.IN_PROGRESS ||
    (visit.assignedUserId != null && visit.status !== VisitStatus.UNSCHEDULED);

  if (!isScheduled) return;

  await prisma.estimate.updateMany({
    where: { id: visit.estimateId, needsScheduling: true },
    data: { needsScheduling: false },
  });
}
