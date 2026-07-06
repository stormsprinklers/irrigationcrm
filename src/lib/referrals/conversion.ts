import type { Division } from "@prisma/client";
import { ReferralSubmissionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isDepositInvoice } from "./utils";
import { getOrCreateReferralProgramSettings } from "./settings";
import { attemptReferralPayout } from "./stripe-connect";

export async function onReferralLeadConverted(params: {
  companyId: string;
  leadId: string;
  customerId: string;
}) {
  const submission = await prisma.referralSubmission.findFirst({
    where: {
      companyId: params.companyId,
      leadId: params.leadId,
      status: { notIn: [ReferralSubmissionStatus.DISQUALIFIED, ReferralSubmissionStatus.EXPIRED] },
    },
  });
  if (!submission) return;

  await prisma.$transaction([
    prisma.referralSubmission.update({
      where: { id: submission.id },
      data: { referredCustomerId: params.customerId },
    }),
    prisma.customer.update({
      where: { id: params.customerId },
      data: { referredByCustomerId: submission.referrerCustomerId },
    }),
  ]);
}

export async function onReferralVisitBooked(params: {
  companyId: string;
  customerId: string;
  visitId: string;
}) {
  const submission = await prisma.referralSubmission.findFirst({
    where: {
      companyId: params.companyId,
      referredCustomerId: params.customerId,
      status: ReferralSubmissionStatus.SUBMITTED,
    },
    orderBy: { createdAt: "desc" },
  });
  if (!submission) return;

  await prisma.referralSubmission.update({
    where: { id: submission.id },
    data: {
      status: ReferralSubmissionStatus.BOOKED,
      visitId: params.visitId,
      bookedAt: new Date(),
    },
  });
}

export async function onReferralEstimateApproved(params: {
  companyId: string;
  estimateId: string;
  customerId: string;
}) {
  const submission = await prisma.referralSubmission.findFirst({
    where: {
      companyId: params.companyId,
      referredCustomerId: params.customerId,
      status: { in: [ReferralSubmissionStatus.SUBMITTED, ReferralSubmissionStatus.BOOKED] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!submission) return;

  await prisma.referralSubmission.update({
    where: { id: submission.id },
    data: {
      status: ReferralSubmissionStatus.ESTIMATE_APPROVED,
      estimateId: params.estimateId,
      estimateApprovedAt: new Date(),
    },
  });
}

function resolveRewardCents(division: Division | null | undefined, settings: {
  installRewardCents: number;
  serviceRewardCents: number;
}) {
  if (division === "INSTALL") return settings.installRewardCents;
  if (division === "SERVICE") return settings.serviceRewardCents;
  return settings.serviceRewardCents;
}

export async function onReferralInvoicePaid(params: {
  companyId: string;
  invoiceId: string;
  customerId: string;
  invoiceNumber: string;
  visitId?: string | null;
}) {
  if (isDepositInvoice(params.invoiceNumber)) return;

  const submission = await prisma.referralSubmission.findFirst({
    where: {
      companyId: params.companyId,
      referredCustomerId: params.customerId,
      status: ReferralSubmissionStatus.ESTIMATE_APPROVED,
    },
    orderBy: { createdAt: "desc" },
  });
  if (!submission) return;

  const visit = params.visitId
    ? await prisma.visit.findFirst({
        where: { id: params.visitId, companyId: params.companyId },
        select: { division: true },
      })
    : null;

  const payments = await prisma.payment.findMany({
    where: {
      invoiceId: params.invoiceId,
      refundedAt: null,
    },
    select: { amount: true },
  });

  const revenueCents = payments.reduce((sum, p) => sum + Math.round(Number(p.amount) * 100), 0);
  const settings = await getOrCreateReferralProgramSettings(params.companyId);
  const rewardCents = resolveRewardCents(visit?.division, settings);

  await prisma.referralSubmission.update({
    where: { id: submission.id },
    data: {
      status: ReferralSubmissionStatus.PAID,
      invoiceId: params.invoiceId,
      visitId: params.visitId ?? submission.visitId,
      division: visit?.division ?? submission.division,
      revenueCents,
      rewardCents,
      paidAt: new Date(),
    },
  });

  await attemptReferralPayout(submission.id);
}

export async function retryReferralOnboardingComplete(memberId: string) {
  const member = await prisma.referralMember.findUnique({
    where: { id: memberId },
    select: { id: true, stripeConnectOnboardedAt: true },
  });
  if (!member?.stripeConnectOnboardedAt) return;

  const pending = await prisma.referralSubmission.findMany({
    where: {
      referrerCustomer: { referralMember: { id: memberId } },
      status: ReferralSubmissionStatus.PAID,
      reward: { status: "PENDING_ONBOARDING" },
    },
    select: { id: true },
  });

  for (const row of pending) {
    await attemptReferralPayout(row.id);
  }
}
