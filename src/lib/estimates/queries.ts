import { EstimateStatus, Prisma } from "@prisma/client";
import { onEstimateClosed } from "@/lib/notifications/estimate-followup";
import { ensureEstimateOptions } from "@/lib/estimates/options";
import { formatEstimateOptionNumber } from "@/lib/estimates/numbering";
import { prisma } from "@/lib/prisma";
import { computeTotals, sumDiscounts, sumLineItems, toNumber } from "@/lib/visits/totals";
import type { EstimateDTO, EstimateListItem } from "./types";

export const estimateInclude = {
  customer: { select: { id: true, name: true, phone: true, email: true, doNotService: true } },
  property: { select: { id: true, name: true, address: true, city: true, state: true, zip: true } },
  visit: { select: { id: true, title: true, startAt: true } },
  options: { orderBy: { sortOrder: "asc" as const } },
  lineItems: {
    orderBy: { sortOrder: "asc" as const },
    include: { priceBookItem: { select: { type: true, unit: true } } },
  },
  discounts: true,
  notes: { orderBy: { createdAt: "desc" as const } },
  attachments: { orderBy: { createdAt: "desc" as const } },
} satisfies Prisma.EstimateInclude;

type EstimatePayload = Prisma.EstimateGetPayload<{ include: typeof estimateInclude }>;

async function attachNoteAuthors(
  notes: EstimatePayload["notes"]
): Promise<EstimateDTO["notes"]> {
  if (!notes.length) return [];
  const authorIds = [...new Set(notes.map((n) => n.authorId))];
  const authors = await prisma.user.findMany({
    where: { id: { in: authorIds } },
    select: { id: true, name: true },
  });
  const authorMap = new Map(authors.map((a) => [a.id, a]));
  return notes.map((note) => ({
    id: note.id,
    body: note.body,
    createdAt: note.createdAt.toISOString(),
    author: authorMap.get(note.authorId) ?? null,
  }));
}

export function serializeEstimate(estimate: EstimatePayload, notes?: EstimateDTO["notes"]): EstimateDTO {
  const optionCount = estimate.options?.length ?? 0;
  const options = (estimate.options ?? []).map((option) => ({
    id: option.id,
    letter: option.letter,
    label: option.label,
    sortOrder: option.sortOrder,
    subtotal: toNumber(option.subtotal),
    discountTotal: toNumber(option.discountTotal),
    total: toNumber(option.total),
    displayNumber: formatEstimateOptionNumber(estimate.estimateNumber, option.letter, optionCount),
  }));

  return {
    id: estimate.id,
    estimateNumber: estimate.estimateNumber ?? null,
    status: estimate.status,
    expiresAt: estimate.expiresAt?.toISOString() ?? null,
    depositRequired: estimate.depositRequired,
    depositType: estimate.depositType,
    depositAmount: estimate.depositAmount != null ? toNumber(estimate.depositAmount) : null,
    signatureBlobUrl: estimate.signatureBlobUrl,
    signedAt: estimate.signedAt?.toISOString() ?? null,
    approvedAt: estimate.approvedAt?.toISOString() ?? null,
    selectedOptionId: estimate.selectedOptionId ?? null,
    subtotal: toNumber(estimate.subtotal),
    discountTotal: toNumber(estimate.discountTotal),
    total: toNumber(estimate.total),
    createdAt: estimate.createdAt.toISOString(),
    updatedAt: estimate.updatedAt.toISOString(),
    customer: estimate.customer,
    property: estimate.property,
    visit: estimate.visit
      ? {
          id: estimate.visit.id,
          title: estimate.visit.title,
          startAt: estimate.visit.startAt.toISOString(),
        }
      : null,
    options,
    lineItems: estimate.lineItems.map((item) => ({
      id: item.id,
      optionId: item.optionId ?? null,
      name: item.name,
      description: item.description,
      quantity: toNumber(item.quantity),
      unitPrice: toNumber(item.unitPrice),
      unit: item.unit?.trim() || item.priceBookItem?.unit?.trim() || "each",
      itemType: item.priceBookItem?.type ?? null,
      total: toNumber(item.total),
      sortOrder: item.sortOrder,
      priceBookItemId: item.priceBookItemId,
    })),
    discounts: estimate.discounts.map((d) => ({
      id: d.id,
      optionId: d.optionId ?? null,
      label: d.label,
      type: d.type,
      amount: toNumber(d.amount),
    })),
    notes: notes ?? [],
    attachments: estimate.attachments.map((a) => ({
      id: a.id,
      blobUrl: a.blobUrl,
      fileName: a.fileName,
      mimeType: a.mimeType,
      createdAt: a.createdAt.toISOString(),
    })),
    designProjectId: estimate.designProjectId ?? null,
    designVersionId: estimate.designVersionId ?? null,
    designExportMetadata: (estimate.designExportMetadata as Record<string, unknown> | null) ?? null,
    estimatedManHours: estimate.estimatedManHours ?? null,
    installDurationDays: estimate.installDurationDays ?? null,
    needsScheduling: estimate.needsScheduling ?? false,
    designInternalBom: estimate.designInternalBom ?? null,
    premiumOptionTotal:
      estimate.premiumOptionTotal != null ? toNumber(estimate.premiumOptionTotal) : null,
    selectedQuoteTier: estimate.selectedQuoteTier ?? null,
  };
}

export function serializeEstimateListItem(estimate: EstimatePayload): EstimateListItem {
  const optionCount = estimate.options?.length ?? 0;
  return {
    id: estimate.id,
    estimateNumber: estimate.estimateNumber ?? null,
    status: estimate.status,
    total: toNumber(estimate.total),
    createdAt: estimate.createdAt.toISOString(),
    expiresAt: estimate.expiresAt?.toISOString() ?? null,
    customer: estimate.customer,
    visit: estimate.visit
      ? {
          id: estimate.visit.id,
          title: estimate.visit.title,
          startAt: estimate.visit.startAt.toISOString(),
        }
      : null,
    optionCount,
    displayNumber:
      optionCount > 1
        ? `${estimate.estimateNumber ?? "EST"} (${optionCount} options)`
        : estimate.estimateNumber ?? null,
  };
}

export function computeEstimateExpiry(expiryDays: number) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiryDays);
  return expiresAt;
}

export async function applyEstimateExpiry(estimateId: string, status: EstimateStatus, expiresAt: Date | null) {
  if (status === EstimateStatus.SENT && expiresAt && expiresAt < new Date()) {
    await prisma.estimate.update({
      where: { id: estimateId },
      data: { status: EstimateStatus.EXPIRED },
    });
    void onEstimateClosed(estimateId).catch(() => {});
    return EstimateStatus.EXPIRED;
  }
  return status;
}

export async function recalculateEstimateTotals(estimateId: string) {
  await ensureEstimateOptions(estimateId);

  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    include: {
      options: { orderBy: { sortOrder: "asc" } },
      lineItems: true,
      discounts: true,
    },
  });
  if (!estimate) return null;

  for (const option of estimate.options) {
    const lineItems = estimate.lineItems.filter((item) => item.optionId === option.id);
    const discounts = estimate.discounts.filter((d) => d.optionId === option.id);
    const subtotal = sumLineItems(lineItems);
    const discountTotal = sumDiscounts(subtotal, discounts);
    const totals = computeTotals(subtotal, discountTotal);
    await prisma.estimateOption.update({
      where: { id: option.id },
      data: {
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        total: totals.total,
      },
    });
  }

  const refreshed = await prisma.estimate.findUnique({
    where: { id: estimateId },
    include: { options: { orderBy: { sortOrder: "asc" } } },
  });
  if (!refreshed) return null;

  const selected =
    refreshed.options.find((o) => o.id === refreshed.selectedOptionId) ?? refreshed.options[0];

  if (!selected) {
    return prisma.estimate.update({
      where: { id: estimateId },
      data: { subtotal: 0, discountTotal: 0, total: 0 },
    });
  }

  return prisma.estimate.update({
    where: { id: estimateId },
    data: {
      selectedOptionId: refreshed.selectedOptionId ?? selected.id,
      subtotal: selected.subtotal,
      discountTotal: selected.discountTotal,
      total: selected.total,
    },
  });
}

export async function getEstimateForCompany(companyId: string, estimateId: string) {
  const estimate = await prisma.estimate.findFirst({
    where: { id: estimateId, companyId },
    include: estimateInclude,
  });
  if (!estimate) return null;

  await ensureEstimateOptions(estimateId);
  await applyEstimateExpiry(estimate.id, estimate.status, estimate.expiresAt);
  const refreshed = await prisma.estimate.findFirst({
    where: { id: estimateId, companyId },
    include: estimateInclude,
  });
  if (!refreshed) return null;

  const notes = await attachNoteAuthors(refreshed.notes);
  return serializeEstimate(refreshed, notes);
}

export async function listEstimates(
  companyId: string,
  filters?: { customerId?: string; visitId?: string; status?: EstimateStatus; search?: string }
) {
  const where: Prisma.EstimateWhereInput = { companyId };

  if (filters?.customerId) where.customerId = filters.customerId;
  if (filters?.visitId) where.visitId = filters.visitId;
  if (filters?.status) where.status = filters.status;

  if (filters?.search?.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { customer: { name: { contains: q, mode: "insensitive" } } },
      { customer: { email: { contains: q, mode: "insensitive" } } },
      { estimateNumber: { contains: q, mode: "insensitive" } },
    ];
  }

  const estimates = await prisma.estimate.findMany({
    where,
    include: estimateInclude,
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  for (const estimate of estimates) {
    await applyEstimateExpiry(estimate.id, estimate.status, estimate.expiresAt);
  }

  const refreshed = await prisma.estimate.findMany({
    where,
    include: estimateInclude,
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return refreshed.map(serializeEstimateListItem);
}
