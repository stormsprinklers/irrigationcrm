import { ReferralRewardStatus, ReferralSubmissionStatus } from "@prisma/client";
import { getStripeClient } from "@/lib/stripe/client";
import { getAppBaseUrl } from "@/lib/app-url";
import { prisma } from "@/lib/prisma";

export async function verifyCompanyStripeConnect(companyId: string) {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  const platformAccountId =
    process.env.STRIPE_PLATFORM_ACCOUNT_ID?.trim() ??
    process.env.STRIPE_CONNECT_ACCOUNT_ID?.trim();
  if (!platformAccountId) {
    throw new Error("Set STRIPE_PLATFORM_ACCOUNT_ID to verify Stripe Connect");
  }

  const stripe = getStripeClient();
  const account = await stripe.accounts.retrieve(platformAccountId);

  await prisma.company.update({
    where: { id: companyId },
    data: { stripeConnectAccountId: account.id },
  });

  return {
    accountId: account.id,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
  };
}

export async function getCompanyConnectStatus(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { stripeConnectAccountId: true },
  });

  if (!company?.stripeConnectAccountId || !process.env.STRIPE_SECRET_KEY) {
    return { connected: false, accountId: null as string | null };
  }

  try {
    const stripe = getStripeClient();
    const account = await stripe.accounts.retrieve(company.stripeConnectAccountId);
    return {
      connected: Boolean(account.charges_enabled && account.payouts_enabled),
      accountId: account.id,
      detailsSubmitted: account.details_submitted,
    };
  } catch {
    return { connected: false, accountId: company.stripeConnectAccountId };
  }
}

export async function createReferrerConnectLink(params: {
  companyId: string;
  customerId: string;
  origin: string;
  refreshPath: string;
  returnPath: string;
}) {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("Stripe is not configured");
  }

  const member = await prisma.referralMember.findFirst({
    where: { companyId: params.companyId, customerId: params.customerId },
    include: { customer: { select: { email: true, name: true, phone: true } } },
  });
  if (!member) throw new Error("Not enrolled in referrals");

  const stripe = getStripeClient();
  const base = getAppBaseUrl(params.origin);

  let accountId = member.stripeConnectAccountId;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      email: member.customer.email ?? undefined,
      capabilities: {
        transfers: { requested: true },
      },
      business_type: "individual",
      metadata: {
        companyId: params.companyId,
        customerId: params.customerId,
        referralMemberId: member.id,
      },
    });
    accountId = account.id;
    await prisma.referralMember.update({
      where: { id: member.id },
      data: { stripeConnectAccountId: accountId },
    });
  }

  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${base}${params.refreshPath}`,
    return_url: `${base}${params.returnPath}`,
    type: "account_onboarding",
  });

  return { url: accountLink.url, accountId };
}

export async function handleConnectAccountUpdated(accountId: string) {
  const member = await prisma.referralMember.findFirst({
    where: { stripeConnectAccountId: accountId },
  });
  if (!member) return;

  if (!process.env.STRIPE_SECRET_KEY) return;
  const stripe = getStripeClient();
  const account = await stripe.accounts.retrieve(accountId);

  if (account.details_submitted && account.payouts_enabled) {
    await prisma.referralMember.update({
      where: { id: member.id },
      data: { stripeConnectOnboardedAt: new Date() },
    });

    const { retryReferralOnboardingComplete } = await import("./conversion");
    await retryReferralOnboardingComplete(member.id);
  }
}

export async function attemptReferralPayout(submissionId: string) {
  const submission = await prisma.referralSubmission.findUnique({
    where: { id: submissionId },
    include: {
      reward: true,
      referrerCustomer: {
        include: { referralMember: true },
      },
    },
  });

  if (!submission || submission.status !== ReferralSubmissionStatus.PAID) return;
  if (submission.reward?.status === ReferralRewardStatus.TRANSFERRED) return;
  if (!submission.rewardCents || submission.rewardCents <= 0) return;

  const member = submission.referrerCustomer.referralMember;
  if (!member) return;

  const company = await prisma.company.findUnique({
    where: { id: submission.companyId },
    select: { stripeConnectAccountId: true, name: true },
  });

  if (!company?.stripeConnectAccountId) {
    await upsertReward(submissionId, submission.rewardCents, {
      status: ReferralRewardStatus.PENDING_PAYOUT,
      failureReason: "Company Stripe Connect is not configured",
    });
    return;
  }

  if (!member.stripeConnectAccountId || !member.stripeConnectOnboardedAt) {
    await upsertReward(submissionId, submission.rewardCents, {
      status: ReferralRewardStatus.PENDING_ONBOARDING,
      failureReason: null,
    });
    return;
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    await upsertReward(submissionId, submission.rewardCents, {
      status: ReferralRewardStatus.FAILED,
      failureReason: "STRIPE_SECRET_KEY is not configured",
    });
    return;
  }

  try {
    const stripe = getStripeClient();
    const transfer = await stripe.transfers.create({
      amount: submission.rewardCents,
      currency: "usd",
      destination: member.stripeConnectAccountId,
      transfer_group: submissionId,
      metadata: {
        submissionId,
        companyId: submission.companyId,
        referrerCustomerId: submission.referrerCustomerId,
      },
    });

    await prisma.$transaction([
      prisma.referralReward.upsert({
        where: { submissionId },
        create: {
          submissionId,
          amountCents: submission.rewardCents,
          status: ReferralRewardStatus.TRANSFERRED,
          stripeTransferId: transfer.id,
          paidAt: new Date(),
        },
        update: {
          amountCents: submission.rewardCents,
          status: ReferralRewardStatus.TRANSFERRED,
          stripeTransferId: transfer.id,
          failureReason: null,
          paidAt: new Date(),
        },
      }),
      prisma.referralSubmission.update({
        where: { id: submissionId },
        data: {
          status: ReferralSubmissionStatus.REWARDED,
          rewardedAt: new Date(),
        },
      }),
    ]);

    void notifyReferrerReward(submission.id).catch(() => {});
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transfer failed";
    await upsertReward(submissionId, submission.rewardCents, {
      status: ReferralRewardStatus.FAILED,
      failureReason: message,
    });
  }
}

async function upsertReward(
  submissionId: string,
  amountCents: number,
  data: { status: ReferralRewardStatus; failureReason: string | null }
) {
  await prisma.referralReward.upsert({
    where: { submissionId },
    create: {
      submissionId,
      amountCents,
      status: data.status,
      failureReason: data.failureReason,
    },
    update: {
      amountCents,
      status: data.status,
      failureReason: data.failureReason,
    },
  });
}

export async function retryReferralPayout(rewardId: string, companyId: string) {
  const reward = await prisma.referralReward.findFirst({
    where: { id: rewardId, submission: { companyId } },
    select: { submissionId: true, status: true },
  });
  if (!reward) throw new Error("Reward not found");
  if (reward.status === ReferralRewardStatus.TRANSFERRED) {
    throw new Error("Reward already paid");
  }

  await attemptReferralPayout(reward.submissionId);
  return prisma.referralReward.findUnique({ where: { id: rewardId } });
}

async function notifyReferrerReward(submissionId: string) {
  const submission = await prisma.referralSubmission.findUnique({
    where: { id: submissionId },
    include: {
      referrerCustomer: { select: { phone: true, name: true } },
      company: { select: { id: true, twilioPhone: true } },
      reward: { select: { amountCents: true } },
    },
  });
  if (!submission?.referrerCustomer.phone || !submission.reward || !submission.company.twilioPhone) {
    return;
  }

  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(submission.reward.amountCents / 100);

  const { sendSms } = await import("@/lib/inbox/twilio");
  await sendSms({
    from: submission.company.twilioPhone,
    to: submission.referrerCustomer.phone,
    body: `Thanks for referring ${submission.referredName}! Your ${amount} referral reward is on the way.`,
  });
}
