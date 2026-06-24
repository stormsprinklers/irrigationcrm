import { VisitStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildNotificationContext } from "./context";
import { scheduleNotificationJob } from "./jobs";
import { sendOperationalNotification } from "./send";
import type { NotificationEvent } from "./templates";
import { createFeedbackSurveyToken } from "./survey";

export async function notifyVisitEvent(params: {
  visitId: string;
  event: NotificationEvent;
  companyId: string;
}) {
  const visit = await prisma.visit.findFirst({
    where: { id: params.visitId, companyId: params.companyId },
    include: {
      customer: true,
      company: true,
      assignedUser: { select: { name: true, websiteTeamSlug: true } },
    },
  });
  if (!visit?.customerId || !visit.customer) return;

  const company = visit.company;
  const surveyToken =
    params.event === "FEEDBACK_SURVEY"
      ? await createFeedbackSurveyToken(visit.id)
      : null;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const portalSlug = company.portalSlug ?? company.bookingSlug;
  const surveyUrl = surveyToken && portalSlug
    ? `${appUrl}/portal/${portalSlug}/feedback/${surveyToken}`
    : null;

  const context = buildNotificationContext({
    company: {
      name: company.name,
      portalSlug: company.portalSlug,
      bookingSlug: company.bookingSlug,
      googleReviewUrl: company.googleReviewUrl,
      websiteBaseUrl: company.websiteBaseUrl,
      arrivalWindowHours: company.arrivalWindowHours,
    },
    customer: visit.customer,
    visit: {
      title: visit.title,
      startAt: visit.startAt,
      address: visit.address,
      city: visit.city,
      state: visit.state,
      zip: visit.zip,
    },
    technician: visit.assignedUser ?? undefined,
    surveyUrl,
  });

  const linkPlaceholders: Record<string, string> = {};
  if (company.googleReviewUrl) linkPlaceholders.review = company.googleReviewUrl;
  if (portalSlug) linkPlaceholders.portal = `${appUrl}/portal/${portalSlug}`;
  if (surveyUrl) linkPlaceholders.survey = surveyUrl;
  if (visit.assignedUser?.websiteTeamSlug) {
    const base =
      company.websiteBaseUrl?.replace(/\/$/, "") ??
      process.env.NEXT_PUBLIC_WEBSITE_URL?.replace(/\/$/, "") ??
      "";
    if (base) linkPlaceholders.technician = `${base}/team/${visit.assignedUser.websiteTeamSlug}`;
  }

  await sendOperationalNotification({
    companyId: params.companyId,
    event: params.event,
    recipient: {
      customerId: visit.customerId,
      name: visit.customer.name,
      email: visit.customer.email,
      phone: visit.customer.phone,
    },
    context,
    options: {
      visitId: visit.id,
      linkPlaceholders,
      smsOnly: params.event === "VISIT_COMPLETED",
    },
  });
}

export async function onVisitCompleted(visitId: string, companyId: string) {
  await notifyVisitEvent({ visitId, event: "VISIT_COMPLETED", companyId });

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { reviewRequestDelayHours: true, feedbackSurveyDelayHours: true },
  });
  if (!company) return;

  if (company.reviewRequestDelayHours <= 0) {
    await notifyVisitEvent({ visitId, event: "REVIEW_REQUEST", companyId });
  } else {
    await scheduleNotificationJob({
      companyId,
      visitId,
      event: "REVIEW_REQUEST",
      delayHours: company.reviewRequestDelayHours,
    });
  }

  if (company.feedbackSurveyDelayHours <= 0) {
    await notifyVisitEvent({ visitId, event: "FEEDBACK_SURVEY", companyId });
  } else {
    await scheduleNotificationJob({
      companyId,
      visitId,
      event: "FEEDBACK_SURVEY",
      delayHours: company.feedbackSurveyDelayHours,
    });
  }
}

export async function onVisitCancelled(visitId: string, companyId: string) {
  const { cancelPendingJobsForVisit } = await import("./jobs");
  await cancelPendingJobsForVisit(visitId, ["REVIEW_REQUEST", "FEEDBACK_SURVEY"]);
  await notifyVisitEvent({ visitId, event: "VISIT_CANCELLED", companyId });
}

export async function onVisitTimeChanged(params: {
  visitId: string;
  companyId: string;
  isInitialSchedule?: boolean;
}) {
  if (params.isInitialSchedule) {
    await notifyVisitEvent({ visitId: params.visitId, event: "VISIT_SCHEDULED", companyId: params.companyId });
    return;
  }

  const visit = await prisma.visit.findUnique({
    where: { id: params.visitId },
    select: { status: true },
  });
  if (visit?.status === VisitStatus.CANCELLED) return;

  await notifyVisitEvent({ visitId: params.visitId, event: "VISIT_TIME_UPDATED", companyId: params.companyId });
}
