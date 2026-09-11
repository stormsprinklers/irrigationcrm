import { WinterizationRequestStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { removeWinterizationSeasonTags } from "@/lib/winterization/tags";
import { parseIsoDate } from "@/lib/winterization/weeks";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDay(value: string) {
  return DATE_RE.test(value);
}

export async function scheduleWinterizationRequests(
  companyId: string,
  ids: string[],
  scheduledDate: string
) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return { updated: 0 };
  if (!isIsoDay(scheduledDate)) {
    throw new Error("Choose a valid date");
  }

  const result = await prisma.winterizationRequest.updateMany({
    where: {
      id: { in: uniqueIds },
      companyId,
      status: { in: [WinterizationRequestStatus.NEED_BOOKING, WinterizationRequestStatus.SCHEDULED] },
    },
    data: {
      status: WinterizationRequestStatus.SCHEDULED,
      scheduledDate: parseIsoDate(scheduledDate),
    },
  });
  return { updated: result.count };
}

export async function removeWinterizationRequests(companyId: string, ids: string[]) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return { updated: 0 };

  const rows = await prisma.winterizationRequest.findMany({
    where: {
      id: { in: uniqueIds },
      companyId,
      status: { in: [WinterizationRequestStatus.NEED_BOOKING, WinterizationRequestStatus.SCHEDULED] },
    },
    select: { id: true, customerId: true, seasonYear: true },
  });
  if (!rows.length) return { updated: 0 };

  await prisma.winterizationRequest.updateMany({
    where: { id: { in: rows.map((row) => row.id) }, companyId },
    data: {
      status: WinterizationRequestStatus.CANCELLED,
      scheduledDate: null,
    },
  });

  const byYear = new Map<number, string[]>();
  for (const row of rows) {
    if (!row.customerId) continue;
    const list = byYear.get(row.seasonYear) ?? [];
    list.push(row.customerId);
    byYear.set(row.seasonYear, list);
  }
  await Promise.all(
    [...byYear.entries()].map(([year, customerIds]) =>
      removeWinterizationSeasonTags(customerIds, year)
    )
  );

  return { updated: rows.length };
}

export async function updateWinterizationSchedulingNotes(
  companyId: string,
  id: string,
  schedulingNotes: string | null
) {
  const existing = await prisma.winterizationRequest.findFirst({
    where: { id, companyId },
    select: { id: true },
  });
  if (!existing) return null;

  const notes = schedulingNotes?.trim() || null;
  const updated = await prisma.winterizationRequest.update({
    where: { id },
    data: { schedulingNotes: notes },
    select: { id: true, schedulingNotes: true },
  });
  return updated;
}
