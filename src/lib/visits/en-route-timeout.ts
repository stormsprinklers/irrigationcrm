import { prisma } from "@/lib/prisma";
import { TimeEventType, VisitStatus } from "@prisma/client";
export const EN_ROUTE_TIMEOUT_MS = 2 * 60 * 60 * 1000;

/** Silent server-side expiration. Never calls customer notification hooks. */
export async function expireEnRouteVisits(companyId?: string, visitId?: string, now = new Date()) {
  const candidates = await prisma.visit.findMany({
    where: { companyId, ...(visitId ? {id: visitId} : {}), status: VisitStatus.EN_ROUTE },
    select: { id: true, companyId: true, updatedAt: true, timeEvents: {where: {type: TimeEventType.EN_ROUTE}, orderBy: {occurredAt: "desc"}, take: 1} },
  });
  let expired = 0;
  for (const visit of candidates) {
    const event = visit.timeEvents[0];
    if (!event) continue;
    const deadline = new Date(event.occurredAt.getTime() + EN_ROUTE_TIMEOUT_MS);
    if (deadline > now) continue;
    expired += await prisma.$transaction(async tx => {
      const result = await tx.visit.updateMany({
        where: {id: visit.id, status: VisitStatus.EN_ROUTE, updatedAt: visit.updatedAt},
        data: {status: VisitStatus.PAUSED, liveTrackingActive: false, liveTrackExpiresAt: deadline, enRouteEtaSeconds: null, enRouteEtaAt: null, enRouteCalculatedAt: null},
      });
      if (!result.count) return 0;
      await tx.visitTimeEvent.create({data: {visitId: visit.id, userId: event.userId, type: TimeEventType.PAUSE, occurredAt: deadline}});
      await tx.techTimeSegment.updateMany({where: {companyId: visit.companyId, visitId: visit.id, category: "DRIVING", endedAt: null, startedAt: {lte: deadline}}, data: {endedAt: deadline}});
      return 1;
    });
  }
  return expired;
}
