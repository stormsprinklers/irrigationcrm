import { NextResponse } from "next/server";
import { VisitStatus } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { isFieldRole } from "@/lib/employees";
import { fieldVisitAssigneeWhere, listEligibleCustomerIdsForFieldSms } from "@/lib/field/access";
import { getOpenTimeSegment, serializeTimeSegment } from "@/lib/field/time-segments";
import { prisma } from "@/lib/prisma";
import { serializeVisit, visitInclude } from "@/lib/visits/queries";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser(request);
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(now);
    dayEnd.setHours(23, 59, 59, 999);

    const assigneeWhere = isFieldRole(user.role)
      ? await fieldVisitAssigneeWhere(user.companyId, user.id)
      : { companyId: user.companyId, assignedUserId: user.id };

    const [clock, openSegment, todayVisits, activeVisit, eligibleCustomerIds] = await Promise.all([
      prisma.timeClockEntry.findFirst({
        where: { companyId: user.companyId, userId: user.id, clockOutAt: null },
        orderBy: { clockInAt: "desc" },
      }),
      getOpenTimeSegment(user.companyId, user.id),
      prisma.visit.findMany({
        where: {
          ...assigneeWhere,
          startAt: { lt: dayEnd },
          endAt: { gt: dayStart },
          status: { not: VisitStatus.CANCELLED },
        },
        include: visitInclude,
        orderBy: { startAt: "asc" },
      }),
      prisma.visit.findFirst({
        where: {
          ...assigneeWhere,
          status: {
            in: [VisitStatus.EN_ROUTE, VisitStatus.IN_PROGRESS, VisitStatus.PAUSED],
          },
        },
        include: visitInclude,
        orderBy: { updatedAt: "desc" },
      }),
      isFieldRole(user.role)
        ? listEligibleCustomerIdsForFieldSms(user)
        : Promise.resolve([] as string[]),
    ]);

    const remainingToday = todayVisits.filter(
      (v) => v.status !== VisitStatus.COMPLETED && v.endAt >= now
    );
    const nextJob =
      remainingToday.find((v) => !["EN_ROUTE", "IN_PROGRESS", "PAUSED"].includes(v.status)) ??
      remainingToday[0] ??
      null;

    let unreadSms = 0;
    if (eligibleCustomerIds.length || !isFieldRole(user.role)) {
      const smsWhere = {
        companyId: user.companyId,
        channel: "SMS" as const,
        scope: "EXTERNAL" as const,
        ...(isFieldRole(user.role) && eligibleCustomerIds.length
          ? { customerId: { in: eligibleCustomerIds } }
          : {}),
      };
      const conversations = await prisma.conversation.findMany({
        where: smsWhere,
        select: {
          messages: {
            where: { direction: "INBOUND", readAt: null },
            take: 1,
            select: { id: true },
          },
        },
        take: 100,
      });
      unreadSms = conversations.filter((c) => c.messages.length > 0).length;
    }

    const missedTransfers = await prisma.callSession.count({
      where: {
        companyId: user.companyId,
        transferTargetUserId: user.id,
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        status: "COMPLETED",
        assignedUserId: { not: user.id },
      },
    });

    return NextResponse.json({
      clock: clock
        ? {
            id: clock.id,
            clockInAt: clock.clockInAt.toISOString(),
            clockOutAt: clock.clockOutAt?.toISOString() ?? null,
          }
        : null,
      openSegment: openSegment ? serializeTimeSegment(openSegment) : null,
      activeVisit: activeVisit ? serializeVisit(activeVisit) : null,
      nextJob: nextJob ? serializeVisit(nextJob) : null,
      todayVisits: todayVisits.map(serializeVisit),
      remainingToday: remainingToday.length,
      alerts: {
        unreadSms,
        missedTransfers,
        timerLeftRunning: openSegment
          ? serializeTimeSegment(openSegment).leftRunning
          : false,
      },
    });
  } catch {
    return unauthorizedResponse();
  }
}
