import { PhoneNumberType } from "@prisma/client";
import { normalizePhone } from "@/lib/inbox/contacts";
import { prisma } from "@/lib/prisma";

/** Outbound caller ID: Voice primary number, then inbox setting, then any company number. */
export async function getCompanyCallerId(companyId: string): Promise<string | null> {
  const [primaryFlag, primaryType, company, fallback] = await Promise.all([
    prisma.phoneNumber.findFirst({
      where: { companyId, isPrimary: true },
      orderBy: { createdAt: "asc" },
      select: { e164: true },
    }),
    prisma.phoneNumber.findFirst({
      where: { companyId, numberType: PhoneNumberType.PRIMARY },
      orderBy: { createdAt: "asc" },
      select: { e164: true },
    }),
    prisma.company.findUnique({
      where: { id: companyId },
      select: { twilioPhone: true },
    }),
    prisma.phoneNumber.findFirst({
      where: { companyId },
      orderBy: { createdAt: "asc" },
      select: { e164: true },
    }),
  ]);

  if (primaryFlag?.e164) return normalizePhone(primaryFlag.e164);
  if (primaryType?.e164) return normalizePhone(primaryType.e164);
  if (company?.twilioPhone) return normalizePhone(company.twilioPhone);
  if (fallback?.e164) return normalizePhone(fallback.e164);

  return null;
}

export async function syncCompanyTwilioPhone(companyId: string, e164: string) {
  const normalized = normalizePhone(e164);
  await prisma.company.update({
    where: { id: companyId },
    data: { twilioPhone: normalized },
  });
  return normalized;
}
