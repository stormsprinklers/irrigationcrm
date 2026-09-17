import { CampaignChannel, CampaignEnrollmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type MarketingOptOut = boolean;

export function isMarketingOptedOut(value: MarketingOptOut | null | undefined) {
  return value === true;
}

export function marketingConsentLabel(value: MarketingOptOut | null | undefined) {
  return value === true ? "Opted out" : "Opted in";
}

/** Cancel active/paused enrollments and pending sends for a customer. */
export async function unenrollCustomerFromCampaigns(params: {
  customerId: string;
  companyId: string;
  channel?: CampaignChannel | "ALL";
  reason?: string;
}) {
  const channel = params.channel ?? "ALL";
  const campaignFilter =
    channel === "ALL"
      ? { companyId: params.companyId }
      : { companyId: params.companyId, channel };

  await prisma.campaignEnrollment.updateMany({
    where: {
      customerId: params.customerId,
      status: { in: [CampaignEnrollmentStatus.ACTIVE, CampaignEnrollmentStatus.PAUSED] },
      campaign: campaignFilter,
    },
    data: { status: CampaignEnrollmentStatus.CANCELLED },
  });

  await prisma.campaignRecipient.updateMany({
    where: {
      customerId: params.customerId,
      status: "pending",
      campaign: campaignFilter,
    },
    data: {
      status: "opt_out",
      error: params.reason ?? "Unsubscribed",
    },
  });
}

export async function optOutCustomerMarketingEmail(params: {
  customerId: string;
  companyId: string;
  /** Email unsubscribe removes the customer from every active campaign. */
  unenrollAllCampaigns?: boolean;
}) {
  await prisma.customer.updateMany({
    where: { id: params.customerId, companyId: params.companyId },
    data: { marketingEmailOptOut: true },
  });
  await unenrollCustomerFromCampaigns({
    customerId: params.customerId,
    companyId: params.companyId,
    channel: params.unenrollAllCampaigns === false ? CampaignChannel.EMAIL : "ALL",
    reason: "Marketing email opt-out",
  });
}

export async function optOutCustomerMarketingSms(params: {
  customerId: string;
  companyId: string;
}) {
  await prisma.customer.updateMany({
    where: { id: params.customerId, companyId: params.companyId },
    data: { marketingSmsOptOut: true },
  });
  await unenrollCustomerFromCampaigns({
    customerId: params.customerId,
    companyId: params.companyId,
    channel: CampaignChannel.SMS,
    reason: "Marketing SMS opt-out",
  });
}

export async function optInCustomerMarketingSms(params: {
  customerId: string;
  companyId: string;
}) {
  await prisma.customer.updateMany({
    where: { id: params.customerId, companyId: params.companyId, doNotService: false },
    data: { marketingSmsOptOut: false },
  });
}
