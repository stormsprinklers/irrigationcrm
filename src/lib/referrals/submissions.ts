import { ReferralSubmissionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ReferralFormInput = {
  referredName: string;
  referredPhone?: string | null;
  referredEmail?: string | null;
  referredAddress?: string | null;
  referredCity?: string | null;
  referredState?: string | null;
  referredZip?: string | null;
};

export async function createReferralSubmission(params: {
  companyId: string;
  memberToken: string;
  input: ReferralFormInput;
}) {
  const member = await prisma.referralMember.findFirst({
    where: { token: params.memberToken, companyId: params.companyId },
    include: {
      customer: { select: { id: true, name: true } },
    },
  });
  if (!member) throw new Error("Invalid referral link");

  const settings = await prisma.referralProgramSettings.findUnique({
    where: { companyId: params.companyId },
  });
  if (!settings?.enabled) throw new Error("Referral program is not active");

  const company = await prisma.company.findUnique({
    where: { id: params.companyId },
    select: { defaultLeadAssigneeId: true },
  });

  const name = params.input.referredName.trim();
  if (!name) throw new Error("Name is required");

  return prisma.$transaction(async (tx) => {
    const lead = await tx.lead.create({
      data: {
        companyId: params.companyId,
        name,
        phone: params.input.referredPhone?.trim() || null,
        email: params.input.referredEmail?.trim() || null,
        source: "Referral",
        assignedUserId: company?.defaultLeadAssigneeId ?? null,
        notes: `Referred by ${member.customer.name}`,
        metadata: {
          referralMemberId: member.id,
          referrerCustomerId: member.customerId,
          referredAddress: params.input.referredAddress ?? null,
          referredCity: params.input.referredCity ?? null,
          referredState: params.input.referredState ?? null,
          referredZip: params.input.referredZip ?? null,
        },
      },
    });

    const submission = await tx.referralSubmission.create({
      data: {
        companyId: params.companyId,
        referrerCustomerId: member.customerId,
        referredName: name,
        referredPhone: params.input.referredPhone?.trim() || null,
        referredEmail: params.input.referredEmail?.trim() || null,
        referredAddress: params.input.referredAddress?.trim() || null,
        referredCity: params.input.referredCity?.trim() || null,
        referredState: params.input.referredState?.trim() || null,
        referredZip: params.input.referredZip?.trim() || null,
        leadId: lead.id,
        status: ReferralSubmissionStatus.SUBMITTED,
      },
    });

    return { lead, submission, referrerName: member.customer.name };
  });
}

export async function getPublicReferralFormMeta(params: {
  companyId: string;
  memberToken: string;
}) {
  const member = await prisma.referralMember.findFirst({
    where: { token: params.memberToken, companyId: params.companyId },
    include: {
      customer: { select: { name: true } },
      company: {
        select: {
          name: true,
          emailLogoUrl: true,
          referralProgramSettings: {
            select: { enabled: true, headline: true, terms: true },
          },
        },
      },
    },
  });
  if (!member) return null;
  if (!member.company.referralProgramSettings?.enabled) return null;

  return {
    companyName: member.company.name,
    logoUrl: member.company.emailLogoUrl,
    referrerName: member.customer.name,
    headline: member.company.referralProgramSettings.headline,
    terms: member.company.referralProgramSettings.terms,
  };
}
