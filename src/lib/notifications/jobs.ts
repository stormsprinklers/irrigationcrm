import { addDays, addHours } from "date-fns";
import { TimeEventType, VisitStatus } from "@prisma/client";
import { clampToAutomatedSendWindow } from "@/lib/communications/send-window";
import { prisma } from "@/lib/prisma";
import type { NotificationEvent } from "./templates";

const COMPLETION_FOLLOW_UP_EVENTS: NotificationEvent[] = [
  "REVIEW_REQUEST",
  "FEEDBACK_SURVEY",
];

async function companyTimezone(companyId: string): Promise<string | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { timezone: true },
  });
  return company?.timezone ?? null;
}

/** When the visit was marked finished — not the scheduled appointment time. */
export async function getVisitCompletedAt(visitId: string): Promise<Date | null> {
  const finish = await prisma.visitTimeEvent.findFirst({
    where: { visitId, type: TimeEventType.FINISH },
    orderBy: { occurredAt: "desc" },
    select: { occurredAt: true },
  });
  if (finish) return finish.occurredAt;

  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    select: { status: true, updatedAt: true },
  });
  if (visit?.status === VisitStatus.COMPLETED) return visit.updatedAt;
  return null;
}

export function followUpRunAt(params: {
  completedAt: Date;
  delayHours: number;
  timeZone?: string | null;
}): Date | null {
  if (params.delayHours <= 0) return null;
  return clampToAutomatedSendWindow(addHours(params.completedAt, params.delayHours), params.timeZone);
}

export async function scheduleNotificationJob(params: {
  companyId: string;
  visitId: string;
  event: NotificationEvent;
  delayHours: number;
  from?: Date;
}) {
  if (params.delayHours <= 0) return null;

  const tz = await companyTimezone(params.companyId);
  const runAt = followUpRunAt({
    completedAt: params.from ?? new Date(),
    delayHours: params.delayHours,
    timeZone: tz,
  });
  if (!runAt) return null;

  const existing = await prisma.notificationJob.findFirst({
    where: {
      companyId: params.companyId,
      visitId: params.visitId,
      event: params.event,
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

export function isCompletionFollowUpEvent(event: string): event is "REVIEW_REQUEST" | "FEEDBACK_SURVEY" {
  return COMPLETION_FOLLOW_UP_EVENTS.includes(event as NotificationEvent);
}

/** Hold survey/review jobs until delayHours after the visit was marked completed. */
export async function holdUntilCompletedDelay(params: {
  visitId: string;
  companyId: string;
  event: string;
  now?: Date;
}): Promise<{ action: "send" } | { action: "hold"; runAt: Date } | { action: "cancel" }> {
  if (!isCompletionFollowUpEvent(params.event)) return { action: "send" };

  const completedAt = await getVisitCompletedAt(params.visitId);
  if (!completedAt) return { action: "cancel" };

  const company = await prisma.company.findUnique({
    where: { id: params.companyId },
    select: {
      timezone: true,
      feedbackSurveyDelayHours: true,
      reviewRequestDelayHours: true,
    },
  });
  if (!company) return { action: "cancel" };

  const delayHours =
    params.event === "FEEDBACK_SURVEY"
      ? company.feedbackSurveyDelayHours
      : company.reviewRequestDelayHours;
  const dueAt = followUpRunAt({
    completedAt,
    delayHours,
    timeZone: company.timezone,
  });
  if (!dueAt) return { action: "send" };

  const now = params.now ?? new Date();
  if (dueAt.getTime() > now.getTime()) return { action: "hold", runAt: dueAt };
  return { action: "send" };
}

export async function scheduleEstimateFollowUpJob(params: {
  companyId: string;
  estimateId: string;
  delayDays: number;
}) {
  if (params.delayDays <= 0) return null;

  const tz = await companyTimezone(params.companyId);
  const runAt = clampToAutomatedSendWindow(addDays(new Date(), params.delayDays), tz);

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
