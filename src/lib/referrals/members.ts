import { prisma } from "@/lib/prisma";
import { buildReferralShareUrl, generateReferralToken } from "./utils";
import { getOrCreateReferralProgramSettings } from "./settings";

export async function enrollReferralMember(params: {
  companyId: string;
  customerId: string;
  origin?: string | null;
}) {
  const settings = await getOrCreateReferralProgramSettings(params.companyId);
  if (!settings.enabled) {
    throw new Error("Referral program is not enabled");
  }

  const customer = await prisma.customer.findFirst({
    where: { id: params.customerId, companyId: params.companyId, status: "ACTIVE" },
    select: { id: true, name: true },
  });
  if (!customer) throw new Error("Customer not found");

  const company = await prisma.company.findUnique({
    where: { id: params.companyId },
    select: { portalSlug: true },
  });
  if (!company?.portalSlug) {
    throw new Error("Set a customer portal slug before enrolling referrers");
  }

  const existing = await prisma.referralMember.findUnique({
    where: { customerId: params.customerId },
  });
  if (existing) {
    return {
      member: existing,
      shareUrl: buildReferralShareUrl({
        portalSlug: company.portalSlug,
        memberToken: existing.token,
        origin: params.origin,
      }),
      created: false,
    };
  }

  let token = generateReferralToken();
  for (let attempt = 0; attempt < 5; attempt++) {
    const collision = await prisma.referralMember.findUnique({ where: { token } });
    if (!collision) break;
    token = generateReferralToken();
  }

  const member = await prisma.referralMember.create({
    data: {
      companyId: params.companyId,
      customerId: params.customerId,
      token,
    },
  });

  return {
    member,
    shareUrl: buildReferralShareUrl({
      portalSlug: company.portalSlug,
      memberToken: member.token,
      origin: params.origin,
    }),
    created: true,
  };
}

export async function autoEnrollCustomerIfEnabled(companyId: string, customerId: string) {
  const settings = await prisma.referralProgramSettings.findUnique({
    where: { companyId },
    select: { enabled: true, autoEnrollCustomers: true },
  });
  if (!settings?.enabled || !settings.autoEnrollCustomers) return null;

  try {
    const result = await enrollReferralMember({ companyId, customerId });
    return result.member;
  } catch {
    return null;
  }
}
