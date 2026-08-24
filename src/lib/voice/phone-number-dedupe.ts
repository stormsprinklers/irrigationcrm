import { PhoneNumberType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { setExclusivePrimaryNumber } from "@/lib/twilio/primary-number";
import { syncCompanyTwilioPhone } from "@/lib/voice/company-phone";

type PhoneRow = {
  id: string;
  companyId: string;
  e164: string;
  twilioSid: string | null;
  isPrimary: boolean;
  numberType: PhoneNumberType;
  createdAt: Date;
};

/**
 * Shared Twilio accounts can only own one CRM row per Twilio SID / E.164.
 * Older "Import from Twilio" sync re-created rows under the active company after
 * reassignment — keep the oldest row in each duplicate group and delete the rest.
 */
export async function removeCrossCompanyPhoneDuplicates(options?: {
  companyIds?: string[];
}): Promise<{ deleted: number }> {
  const where = options?.companyIds?.length
    ? { companyId: { in: options.companyIds } }
    : {};

  const rows: PhoneRow[] = await prisma.phoneNumber.findMany({
    where,
    select: {
      id: true,
      companyId: true,
      e164: true,
      twilioSid: true,
      isPrimary: true,
      numberType: true,
      createdAt: true,
    },
  });

  const groups = new Map<string, PhoneRow[]>();

  // Prefer Twilio SID grouping; fall back to E.164 for rows without a SID.
  for (const row of rows) {
    const key = row.twilioSid?.startsWith("PN")
      ? `sid:${row.twilioSid}`
      : `e164:${row.e164}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const toDelete: PhoneRow[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    toDelete.push(...group.slice(1));
  }

  // Catch SID-less duplicates of a SID-backed row with the same E.164.
  const byE164 = new Map<string, PhoneRow[]>();
  for (const row of rows) {
    if (toDelete.some((d) => d.id === row.id)) continue;
    const list = byE164.get(row.e164) ?? [];
    list.push(row);
    byE164.set(row.e164, list);
  }
  for (const group of byE164.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    for (const extra of group.slice(1)) {
      if (!toDelete.some((d) => d.id === extra.id)) toDelete.push(extra);
    }
  }

  for (const row of toDelete) {
    await prisma.phoneNumber.delete({ where: { id: row.id } }).catch(() => undefined);
    await repairCompanyPrimaryAfterNumberRemoved(row);
  }

  return { deleted: toDelete.length };
}

async function repairCompanyPrimaryAfterNumberRemoved(row: PhoneRow) {
  const company = await prisma.company.findUnique({
    where: { id: row.companyId },
    select: { twilioPhone: true },
  });
  const wasPrimary =
    row.isPrimary ||
    row.numberType === PhoneNumberType.PRIMARY ||
    company?.twilioPhone === row.e164;
  if (!wasPrimary) return;

  const nextPrimary = await prisma.phoneNumber.findFirst({
    where: { companyId: row.companyId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
  if (nextPrimary) {
    await setExclusivePrimaryNumber({
      companyId: row.companyId,
      numberId: nextPrimary.id,
    });
    await syncCompanyTwilioPhone(row.companyId, nextPrimary.e164).catch(() => undefined);
    return;
  }

  await prisma.company
    .update({
      where: { id: row.companyId },
      data: { twilioPhone: null },
    })
    .catch(() => undefined);
}
