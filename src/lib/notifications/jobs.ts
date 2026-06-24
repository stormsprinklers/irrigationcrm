import { addDays, addHours } from "date-fns";
import { prisma } from "@/lib/prisma";
import type { NotificationEvent } from "./templates";

export async function scheduleNotificationJob(params: {
  companyId: string;
  visitId: string;
  event: NotificationEvent;
  delayHours: number;
}) {
  if (params.delayHours <= 0) return null;

  const runAt = addHours(new Date(), params.delayHours);

  const existing = await prisma.notificationJob.findFirst({
    where: {
      companyId: params.companyId,
      visitId: params.visitId,
      event: params.event,
      processedAt: null,
    },
  });
  if (existing) return existing;

  return prisma.notificationJob.create({
    data: {
      companyId: params.companyId,
      visitId: params.visitId,
      event: params.event,
      runAt,
    },
  });
}

export async function cancelPendingJobsForVisit(visitId: string, events?: NotificationEvent[]) {
  await prisma.notificationJob.updateMany({
    where: {
      visitId,
      processedAt: null,
      ...(events?.length ? { event: { in: events } } : {}),
    },
    data: { processedAt: new Date() },
  });
}

export async function scheduleEstimateFollowUpJob(params: {
  companyId: string;
  estimateId: string;
  delayDays: number;
}) {
  if (params.delayDays <= 0) return null;

  const runAt = addDays(new Date(), params.delayDays);

  const existing = await prisma.notificationJob.findFirst({
    where: {
      companyId: params.companyId,
      estimateId: params.estimateId,
      event: "ESTIMATE_FOLLOW_UP",
      processedAt: null,
    },
  });
  if (existing) {
    return prisma.notificationJob.update({
      where: { id: existing.id },
      data: { runAt },
    });
  }

  return prisma.notificationJob.create({
    data: {
      companyId: params.companyId,
      estimateId: params.estimateId,
      event: "ESTIMATE_FOLLOW_UP",
      runAt,
    },
  });
}

export async function cancelPendingJobsForEstimate(estimateId: string) {
  await prisma.notificationJob.updateMany({
    where: {
      estimateId,
      event: "ESTIMATE_FOLLOW_UP",
      processedAt: null,
    },
    data: { processedAt: new Date() },
  });
}
