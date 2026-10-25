import { VisitStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { customerPortalHomeUrl, customerSurveyUrl } from "@/lib/company/customer-url";
import { buildNotificationContext } from "./context";
import { cancelPendingJobsForVisit, scheduleNotificationJob } from "./jobs";
import { sendOperationalNotification } from "./send";
import type { NotificationEvent } from "./templates";
import { createFeedbackSurveyToken } from "./survey";

export function resolveReviewDestination(
  googleReviewUrl?: string | null,
  surveyUrl?: string | null
): string | null {
  return googleReviewUrl?.trim() || surveyUrl?.trim() || null;
}

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
      property: true,
      assignedUser: { select: { name: true, websiteTeamSlug: true } },
    },
  });
  if (!visit?.customerId || !visit.customer) return;

  const company = visit.company;
  const needsSurveyFallback =
    params.event === "FEEDBACK_SURVEY" ||
    (params.event === "REVIEW_REQUEST" && !company.googleReviewUrl?.trim());
  const surveyToken =
    needsSurveyFallback
      ? await createFeedbackSurveyToken(visit.id)
      : null;
  const surveyUrl = surveyToken ? customerSurveyUrl(company, surveyToken) : null;
  const portalHome = customerPortalHomeUrl(company);

  const context = buildNotificationContext({
    company: {
      name: company.name,
      timezone: company.timezone,
      portalSlug: company.portalSlug,
      bookingSlug: company.bookingSlug,
      websiteBookingUrl: company.websiteBookingUrl,
      customerBaseUrl: company.customerBaseUrl,
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
      meetingUrl: visit.meetingUrl,
    },
    technician: visit.assignedUser ?? undefined,
    property: visit.property ?? undefined,
    surveyUrl,
  });

  const linkPlaceholders: Record<string, string> = {};
  const reviewUrl = resolveReviewDestination(company.googleReviewUrl, surveyUrl);
  // A review template without a destination produces a broken, linkless ask.
  // If neither Google nor the built-in survey can be resolved, do not send it.
  if (params.event === "REVIEW_REQUEST" && !reviewUrl) return;
  if (reviewUrl) linkPlaceholders.review = reviewUrl;
  if (portalHome) linkPlaceholders.portal = portalHome;
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
  // Review requests are payment follow-ups. Clear legacy completion-based jobs
  // so completing a visit (often immediately before sending its invoice) cannot
  // ask for a review before the balance is paid.
  await cancelPendingJobsForVisit(visitId, ["REVIEW_REQUEST", "FEEDBACK_SURVEY"]);
  await notifyVisitEvent({ visitId, event: "VISIT_COMPLETED", companyId });
}

export async function onInvoiceFullyPaid(params: {
  visitId: string;
  companyId: string;
  paidAt?: Date;
}) {
  await cancelPendingJobsForVisit(params.visitId, ["REVIEW_REQUEST", "FEEDBACK_SURVEY"]);

  const alreadySent = await prisma.notificationDelivery.findFirst({
    where: {
      companyId: params.companyId,
      visitId: params.visitId,
      event: "REVIEW_REQUEST",
      OR: [{ emailSent: true }, { smsSent: true }],
    },
    select: { id: true },
  });
  if (alreadySent) return;

  const company = await prisma.company.findUnique({
    where: { id: params.companyId },
    select: { notifyReviewRequest: true, reviewRequestDelayHours: true },
  });
  if (!company?.notifyReviewRequest) return;

  if (company.reviewRequestDelayHours <= 0) {
    await notifyVisitEvent({
      visitId: params.visitId,
      event: "REVIEW_REQUEST",
      companyId: params.companyId,
    });
  } else {
    await scheduleNotificationJob({
      companyId: params.companyId,
      visitId: params.visitId,
      event: "REVIEW_REQUEST",
      delayHours: company.reviewRequestDelayHours,
      from: params.paidAt ?? new Date(),
    });
  }
}

export async function onVisitCancelled(visitId: string, companyId: string) {
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
