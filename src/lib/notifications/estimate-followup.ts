import { EstimateStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/visits/totals";
import { buildNotificationContext } from "./context";
import { cancelPendingJobsForEstimate, scheduleEstimateFollowUpJob } from "./jobs";
import { sendOperationalNotification } from "./send";

export function isEstimateOpenForFollowUp(status: EstimateStatus): boolean {
  return status === EstimateStatus.SENT;
}

async function buildEstimateFollowUpPayload(estimateId: string, companyId: string) {
  const estimate = await prisma.estimate.findFirst({
    where: { id: estimateId, companyId },
    include: { customer: true, company: true },
  });
  if (!estimate?.customer) return null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const portalSlug = estimate.company.portalSlug ?? estimate.company.bookingSlug;
  const estimateUrl = portalSlug
    ? `${appUrl}/portal/${portalSlug}/estimates/${estimate.publicToken}`
    : `${appUrl}/estimates/${estimate.id}`;

  const context = buildNotificationContext({
    company: estimate.company,
    customer: estimate.customer,
    estimate: { publicToken: estimate.publicToken },
    estimateUrl,
  });

  return {
    estimate,
    context: {
      ...context,
      estimate_amount: new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(toNumber(estimate.total)),
    },
    estimateUrl,
  };
}

export async function notifyEstimateFollowUp(estimateId: string, companyId: string) {
  const payload = await buildEstimateFollowUpPayload(estimateId, companyId);
  if (!payload) return { emailSent: false, smsSent: false, skipped: ["no customer"] };

  const { estimate, context, estimateUrl } = payload;

  return sendOperationalNotification({
    companyId,
    event: "ESTIMATE_FOLLOW_UP",
    recipient: {
      customerId: estimate.customerId,
      name: estimate.customer.name,
      email: estimate.customer.email,
      phone: estimate.customer.phone,
    },
    context,
    options: {
      estimateId: estimate.id,
      linkPlaceholders: { estimate: estimateUrl },
    },
  });
}

export async function scheduleEstimateFollowUp(estimateId: string, companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { notifyEstimateFollowUp: true, estimateFollowUpIntervalDays: true },
  });
  if (!company?.notifyEstimateFollowUp) return;

  await cancelPendingJobsForEstimate(estimateId);
  await scheduleEstimateFollowUpJob({
    companyId,
    estimateId,
    delayDays: company.estimateFollowUpIntervalDays,
  });
}

export async function onEstimateSent(estimateId: string, companyId: string) {
  await scheduleEstimateFollowUp(estimateId, companyId);
}

export async function onEstimateClosed(estimateId: string) {
  await cancelPendingJobsForEstimate(estimateId);
}

export async function onEstimateStatusChange(estimateId: string, status: EstimateStatus) {
  if (!isEstimateOpenForFollowUp(status)) {
    await onEstimateClosed(estimateId);
  }
}

export async function processEstimateFollowUpJob(params: {
  jobId: string;
  estimateId: string;
  companyId: string;
}) {
  const estimate = await prisma.estimate.findFirst({
    where: { id: params.estimateId, companyId: params.companyId },
    select: { status: true },
  });

  if (!estimate || !isEstimateOpenForFollowUp(estimate.status)) {
    await prisma.notificationJob.update({
      where: { id: params.jobId },
      data: { processedAt: new Date() },
    });
    return { sent: false, reason: "estimate not open" };
  }

  const company = await prisma.company.findUnique({
    where: { id: params.companyId },
    select: { notifyEstimateFollowUp: true, estimateFollowUpIntervalDays: true },
  });

  if (!company?.notifyEstimateFollowUp) {
    await prisma.notificationJob.update({
      where: { id: params.jobId },
      data: { processedAt: new Date() },
    });
    return { sent: false, reason: "follow-ups disabled" };
  }

  await notifyEstimateFollowUp(params.estimateId, params.companyId);

  await prisma.notificationJob.update({
    where: { id: params.jobId },
    data: { processedAt: new Date() },
  });

  const refreshed = await prisma.estimate.findUnique({
    where: { id: params.estimateId },
    select: { status: true },
  });
  if (refreshed && isEstimateOpenForFollowUp(refreshed.status)) {
    await scheduleEstimateFollowUpJob({
      companyId: params.companyId,
      estimateId: params.estimateId,
      delayDays: company.estimateFollowUpIntervalDays,
    });
  }

  return { sent: true };
}
