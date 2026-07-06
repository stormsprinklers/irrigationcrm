import type { ReferralRewardStatus, ReferralSubmissionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isDepositInvoice } from "./utils";

const BOOKED_PLUS: ReferralSubmissionStatus[] = [
  "BOOKED",
  "ESTIMATE_APPROVED",
  "PAID",
  "REWARDED",
];

const PAID_PLUS: ReferralSubmissionStatus[] = ["PAID", "REWARDED"];

export type ReferralDashboardMetrics = {
  totalSubmissions: number;
  bookingRate: number | null;
  conversionRate: number | null;
  referralRevenueCents: number;
  averageTicketCents: number | null;
};

export async function computeReferralMetrics(params: {
  companyId: string;
  start?: Date;
  end?: Date;
}): Promise<ReferralDashboardMetrics> {
  const createdAt =
    params.start && params.end
      ? { gte: params.start, lte: params.end }
      : undefined;

  const submissions = await prisma.referralSubmission.findMany({
    where: {
      companyId: params.companyId,
      ...(createdAt ? { createdAt } : {}),
    },
    select: { status: true, revenueCents: true },
  });

  const total = submissions.length;
  const booked = submissions.filter((s) => BOOKED_PLUS.includes(s.status)).length;
  const paid = submissions.filter((s) => PAID_PLUS.includes(s.status)).length;

  const referredCustomerIds = await prisma.referralSubmission.findMany({
    where: {
      companyId: params.companyId,
      referredCustomerId: { not: null },
      ...(createdAt ? { createdAt } : {}),
    },
    select: { referredCustomerId: true },
  });

  const customerIds = [
    ...new Set(
      referredCustomerIds
        .map((r) => r.referredCustomerId)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  let referralRevenueCents = 0;
  if (customerIds.length > 0) {
    const invoices = await prisma.invoice.findMany({
      where: {
        companyId: params.companyId,
        customerId: { in: customerIds },
        status: "PAID",
        ...(params.start && params.end
          ? { paidAt: { gte: params.start, lte: params.end } }
          : {}),
      },
      select: {
        invoiceNumber: true,
        payments: {
          where: { refundedAt: null },
          select: { amount: true },
        },
      },
    });

    for (const invoice of invoices) {
      if (isDepositInvoice(invoice.invoiceNumber)) continue;
      for (const payment of invoice.payments) {
        referralRevenueCents += Math.round(Number(payment.amount) * 100);
      }
    }
  }

  const paidCount = submissions.filter((s) => s.status === "PAID" || s.status === "REWARDED").length;

  return {
    totalSubmissions: total,
    bookingRate: total > 0 ? booked / total : null,
    conversionRate: total > 0 ? paid / total : null,
    referralRevenueCents,
    averageTicketCents: paidCount > 0 ? Math.round(referralRevenueCents / paidCount) : null,
  };
}

export type ReferralPipelineRow = {
  id: string;
  referrerName: string;
  referredName: string;
  referredContact: string | null;
  status: ReferralSubmissionStatus;
  division: string | null;
  revenueCents: number | null;
  rewardCents: number | null;
  rewardStatus: ReferralRewardStatus | null;
  createdAt: string;
};

export async function listReferralPipeline(params: {
  companyId: string;
  start?: Date;
  end?: Date;
  limit?: number;
}): Promise<ReferralPipelineRow[]> {
  const rows = await prisma.referralSubmission.findMany({
    where: {
      companyId: params.companyId,
      ...(params.start && params.end
        ? { createdAt: { gte: params.start, lte: params.end } }
        : {}),
    },
    include: {
      referrerCustomer: { select: { name: true } },
      reward: { select: { status: true } },
    },
    orderBy: { createdAt: "desc" },
    take: params.limit ?? 200,
  });

  return rows.map((row) => ({
    id: row.id,
    referrerName: row.referrerCustomer.name,
    referredName: row.referredName,
    referredContact: row.referredPhone ?? row.referredEmail ?? null,
    status: row.status,
    division: row.division,
    revenueCents: row.revenueCents,
    rewardCents: row.rewardCents,
    rewardStatus: row.reward?.status ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export type ReferralRewardQueueRow = {
  id: string;
  submissionId: string;
  referrerName: string;
  referredName: string;
  amountCents: number;
  status: ReferralRewardStatus;
  failureReason: string | null;
  paidAt: string | null;
  createdAt: string;
};

export async function listReferralRewardsQueue(companyId: string): Promise<ReferralRewardQueueRow[]> {
  const rewards = await prisma.referralReward.findMany({
    where: {
      submission: { companyId },
      status: { in: ["PENDING_ONBOARDING", "PENDING_PAYOUT", "FAILED"] },
    },
    include: {
      submission: {
        select: {
          referredName: true,
          referrerCustomer: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return rewards.map((reward) => ({
    id: reward.id,
    submissionId: reward.submissionId,
    referrerName: reward.submission.referrerCustomer.name,
    referredName: reward.submission.referredName,
    amountCents: reward.amountCents,
    status: reward.status,
    failureReason: reward.failureReason,
    paidAt: reward.paidAt?.toISOString() ?? null,
    createdAt: reward.createdAt.toISOString(),
  }));
}
