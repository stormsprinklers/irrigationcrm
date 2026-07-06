import { prisma } from "@/lib/prisma";

export async function getOrCreateReferralProgramSettings(companyId: string) {
  const existing = await prisma.referralProgramSettings.findUnique({
    where: { companyId },
  });
  if (existing) return existing;

  return prisma.referralProgramSettings.create({
    data: { companyId },
  });
}

export type ReferralProgramSettingsUpdate = {
  enabled?: boolean;
  installRewardCents?: number;
  serviceRewardCents?: number;
  autoEnrollCustomers?: boolean;
  headline?: string | null;
  terms?: string | null;
};

export async function updateReferralProgramSettings(
  companyId: string,
  data: ReferralProgramSettingsUpdate
) {
  await getOrCreateReferralProgramSettings(companyId);
  return prisma.referralProgramSettings.update({
    where: { companyId },
    data,
  });
}
